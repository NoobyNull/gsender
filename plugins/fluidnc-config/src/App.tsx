import { useMemo, useState } from "react";
import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import yaml from "js-yaml";
import schemaJson from "./vendor/fluidnc-config-schema.json";
import PinAwareTextWidget from "./PinWidget";

// Machine configs vendored from bdring/fluidnc-config-files (official +
// contributed) and FluidNC's example_configs (all GPL-3, same as gSender).
// Lazy glob keeps them out of the main bundle; each loads on selection.
const TEMPLATE_LOADERS = import.meta.glob("./vendor/configs/**/*.yaml", {
	query: "?raw",
	import: "default",
}) as Record<string, () => Promise<string>>;

// "./vendor/configs/official/6_Pack_OLED.yaml" -> { group: "official", label: "6 Pack OLED" }
const templateMeta = (path: string) => {
	const parts = path.replace("./vendor/configs/", "").split("/");
	const group = parts[0];
	const label = parts
		.slice(1)
		.join(" / ")
		.replace(/\.yaml$/, "")
		.replace(/_/g, " ");
	return { group, label };
};

const TEMPLATE_GROUPS: Record<string, { label: string; path: string }[]> = {};
for (const path of Object.keys(TEMPLATE_LOADERS).sort()) {
	const { group, label } = templateMeta(path);
	(TEMPLATE_GROUPS[group] ??= []).push({ label, path });
}

// Live template listing from the community repo. GitHub's API and raw hosts
// send CORS headers, so this works straight from the plugin sandbox; the
// vendored set above remains the offline fallback.
const GH_REPO = "bdring/fluidnc-config-files";
const GH_BRANCH = "main";

const fetchGitHubTemplates = async (): Promise<
	{ label: string; path: string }[]
> => {
	const res = await fetch(
		`https://api.github.com/repos/${GH_REPO}/git/trees/${GH_BRANCH}?recursive=1`,
	);
	if (!res.ok) {
		throw new Error(`GitHub API ${res.status}`);
	}
	const tree = (await res.json()) as {
		tree: { path: string; type: string }[];
	};
	return tree.tree
		.filter((e) => e.type === "blob" && e.path.endsWith(".yaml"))
		.map((e) => ({
			label: e.path.replace(/\.yaml$/, "").replace(/_/g, " "),
			path: e.path,
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
};

const schema = schemaJson as RJSFSchema;

// Section groups over the schema's top-level keys, mirroring the FluidNC web
// installer's layout. Keys the schema grows later fall into "Other".
// Tab taxonomy mirrors the FluidNC web installer (General / Axes / IO /
// Spindle), plus a tab for macros/ATC which the installer doesn't cover.
const SECTION_GROUPS: { title: string; keys: string[] }[] = [
	{
		title: "General",
		keys: [
			"name",
			"board",
			"meta",
			"stepping",
			"kinematics",
			"start",
			"parking",
			"arc_tolerance_mm",
			"junction_deviation_mm",
			"planner_blocks",
			"verbose_errors",
			"report_inches",
			"use_line_numbers",
			"enable_parking_override_control",
		],
	},
	{ title: "Axes", keys: ["axes"] },
	{
		title: "IO",
		keys: [
			"control",
			"probe",
			"user_inputs",
			"coolant",
			"user_outputs",
			"status_outputs",
			"oled",
			"i2so",
			"spi",
			"sdcard",
			"extenders",
		],
	},
	{
		title: "Spindle",
		keys: [
			"PWM",
			"10V",
			"DAC",
			"HBridge",
			"Laser",
			"Relay",
			"OnOff",
			"BESC",
			"PlasmaSpindle",
			"NoSpindle",
			"ModbusVFD",
			"Huanyang",
			"H2A",
			"YL620",
			"DeltaMS300",
			"FolinnBD600",
			"H100",
			"MollomG70",
			"NowForever",
			"SiemensV20",
			"DanfossVLT2800",
		],
	},
	{ title: "Macros & ATC", keys: ["macros", "atc_manual"] },
];

const groupedKeys = new Set(SECTION_GROUPS.flatMap((g) => g.keys));
const otherKeys = Object.keys(schema.properties ?? {}).filter(
	(k) => !groupedKeys.has(k),
);
if (otherKeys.length) {
	SECTION_GROUPS.push({ title: "Other", keys: otherKeys });
}

const pick = (obj: Record<string, unknown>, keys: string[]) => {
	const out: Record<string, unknown> = {};
	for (const k of keys) {
		if (k in obj) out[k] = obj[k];
	}
	return out;
};

// ---- Pin usage analysis ----------------------------------------------------
// The schema validates pin syntax per field; cross-field constraints (a GPIO
// assigned twice, ESP32 hardware limits) need document-wide analysis.

interface PinUse {
	pin: string; // normalized, e.g. "gpio.22"
	path: string; // config path, e.g. "axes.x.motor0.step_pin"
	key: string; // leaf key name
}

const PIN_RE = /^(gpio|i2so|uart_channel\d+)\.(\d+)/i;

const collectPins = (
	node: unknown,
	path: string,
	out: PinUse[],
): PinUse[] => {
	if (typeof node === "string") {
		const m = node.trim().match(PIN_RE);
		if (m) {
			out.push({
				pin: `${m[1].toLowerCase()}.${m[2]}`,
				path,
				key: path.split(".").pop() ?? path,
			});
		}
	} else if (node && typeof node === "object" && !Array.isArray(node)) {
		for (const [k, v] of Object.entries(node)) {
			collectPins(v, path ? `${path}.${k}` : k, out);
		}
	} else if (Array.isArray(node)) {
		node.forEach((v, i) => collectPins(v, `${path}[${i}]`, out));
	}
	return out;
};

// Output-driving leaf keys (heuristic; used for the ESP32 input-only check).
const OUTPUT_KEY_RE =
	/(step|direction|disable|enable|output|pwm|forward|reverse|cs|txd|sck|mosi|data|ws|bck|flood|mist|relay)_pin$/i;

interface PinIssue {
	level: "error" | "warn";
	message: string;
}

const analyzePins = (config: Record<string, unknown>): PinIssue[] => {
	const uses = collectPins(config, "", []);
	const issues: PinIssue[] = [];

	const byPin = new Map<string, PinUse[]>();
	for (const u of uses) {
		(byPin.get(u.pin) ?? byPin.set(u.pin, []).get(u.pin))!.push(u);
	}

	for (const [pin, list] of byPin) {
		if (list.length > 1) {
			issues.push({
				level: "error",
				message: `${pin} assigned ${list.length}×: ${list.map((u) => u.path).join(", ")}`,
			});
		}
		const m = pin.match(/^gpio\.(\d+)$/);
		if (m) {
			const n = Number(m[1]);
			// ESP32 (the overwhelmingly common FluidNC target): 6-11 are flash
			// pins; 34-39 are input-only. Other MCUs differ — heuristic warning.
			if (n >= 6 && n <= 11) {
				issues.push({
					level: "error",
					message: `${pin} (${list[0].path}) is an ESP32 flash pin — using it will crash the controller`,
				});
			}
			if (n >= 34 && n <= 39 && list.some((u) => OUTPUT_KEY_RE.test(u.key))) {
				issues.push({
					level: "warn",
					message: `${pin} is input-only on ESP32 but used as an output (${list
						.filter((u) => OUTPUT_KEY_RE.test(u.key))
						.map((u) => u.path)
						.join(", ")})`,
				});
			}
		}
	}

	return issues;
};

export default function App() {
	const [config, setConfig] = useState<Record<string, unknown>>({});
	const [sourceName, setSourceName] = useState<string>("(new config)");
	const [error, setError] = useState<string>("");
	const [showYaml, setShowYaml] = useState(false);
	const [section, setSection] = useState(SECTION_GROUPS[0].title);
	const [ghTemplates, setGhTemplates] = useState<
		{ label: string; path: string }[] | null
	>(null);
	const [ghLoading, setGhLoading] = useState(false);

	const activeGroup =
		SECTION_GROUPS.find((g) => g.title === section) ?? SECTION_GROUPS[0];

	// Sub-schema for just the active section; $defs kept so $refs resolve.
	const sectionSchema = useMemo<RJSFSchema>(
		() => ({
			type: "object",
			properties: pick(
				(schema.properties ?? {}) as Record<string, unknown>,
				activeGroup.keys,
			) as RJSFSchema["properties"],
			$defs: schema.$defs,
		}),
		[activeGroup],
	);

	const sectionData = useMemo(
		() => pick(config, activeGroup.keys),
		[config, activeGroup],
	);

	const mergeSection = (data: Record<string, unknown> | undefined) => {
		setConfig((prev) => {
			const next = { ...prev };
			for (const k of activeGroup.keys) {
				delete next[k];
			}
			return { ...next, ...(data ?? {}) };
		});
	};

	const yamlOut = useMemo(() => {
		try {
			return yaml.dump(config, { noRefs: true, lineWidth: 120 });
		} catch (e) {
			return `# serialization error: ${e}`;
		}
	}, [config]);

	const pinIssues = useMemo(() => analyzePins(config), [config]);

	// pin -> paths using it; consumed by PinAwareTextWidget via formContext.
	const usedPins = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const u of collectPins(config, "", [])) {
			(map.get(u.pin) ?? map.set(u.pin, []).get(u.pin))!.push(u.path);
		}
		return map;
	}, [config]);

	const loadYamlText = (text: string, name: string) => {
		try {
			// json:true tolerates duplicated mapping keys (last wins) — FluidNC's
			// own parser accepts them and community configs contain them.
			const doc = yaml.load(text, { json: true });
			if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
				throw new Error("not a YAML mapping");
			}
			setConfig(doc as Record<string, unknown>);
			setSourceName(name);
			setError("");
		} catch (e) {
			setError(`Could not parse ${name}: ${e}`);
		}
	};

	const loadGhList = () => {
		setGhLoading(true);
		fetchGitHubTemplates()
			.then((list) => {
				setGhTemplates(list);
				setError("");
			})
			.catch((e) => setError(`GitHub listing failed: ${e}`))
			.finally(() => setGhLoading(false));
	};

	const loadGhTemplate = (path: string) => {
		fetch(`https://raw.githubusercontent.com/${GH_REPO}/${GH_BRANCH}/${path}`)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.text();
			})
			.then((text) =>
				loadYamlText(text, path.split("/").pop() ?? "config.yaml"),
			)
			.catch((e) => setError(`GitHub download failed: ${e}`));
	};

	const openFile = (ev: React.ChangeEvent<HTMLInputElement>) => {
		const file = ev.target.files?.[0];
		if (!file) return;
		file.text().then((text) => loadYamlText(text, file.name));
		ev.target.value = "";
	};

	const download = () => {
		const result = validator.validateFormData(config, schema);
		if (result.errors.length) {
			setError(
				`Config has ${result.errors.length} validation issue(s) — downloading anyway. First: ${result.errors[0].stack}`,
			);
		} else {
			setError("");
		}
		const blob = new Blob([yamlOut], { type: "text/yaml" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = sourceName.endsWith(".yaml") ? sourceName : "config.yaml";
		a.click();
		URL.revokeObjectURL(a.href);
	};

	return (
		<div className="fnc-root">
			<header className="fnc-toolbar">
				<strong>FluidNC Configurator</strong>
				<span className="fnc-source">{sourceName}</span>
				<label className="fnc-btn">
					Open YAML…
					<input
						type="file"
						accept=".yaml,.yml"
						onChange={openFile}
						hidden
					/>
				</label>
				<select
					className="fnc-btn"
					value=""
					onChange={(e) => {
						const path = e.target.value;
						if (!path) return;
						const name = templateMeta(path).label.replace(/ /g, "_");
						TEMPLATE_LOADERS[path]()
							.then((text) => loadYamlText(text, `${name}.yaml`))
							.catch((err) => setError(`Could not load template: ${err}`));
					}}
				>
					<option value="">Start from template…</option>
					{Object.entries(TEMPLATE_GROUPS).map(([group, items]) => (
						<optgroup key={group} label={`${group} (bundled)`}>
							{items.map((t) => (
								<option key={t.path} value={t.path}>
									{t.label}
								</option>
							))}
						</optgroup>
					))}
				</select>
				{ghTemplates === null ? (
					<button
						type="button"
						className="fnc-btn"
						disabled={ghLoading}
						onClick={loadGhList}
					>
						{ghLoading ? "Fetching…" : "Fetch latest from GitHub"}
					</button>
				) : (
					<select
						className="fnc-btn"
						value=""
						onChange={(e) => {
							if (e.target.value) loadGhTemplate(e.target.value);
						}}
					>
						<option value="">
							GitHub templates ({ghTemplates.length})…
						</option>
						{ghTemplates.map((t) => (
							<option key={t.path} value={t.path}>
								{t.label}
							</option>
						))}
					</select>
				)}
				<button
					type="button"
					className="fnc-btn"
					onClick={() => setShowYaml((v) => !v)}
				>
					{showYaml ? "Hide YAML" : "View YAML"}
				</button>
				<button
					type="button"
					className="fnc-btn fnc-primary"
					onClick={download}
				>
					Validate &amp; Download
				</button>
			</header>

			{error && <div className="fnc-error">{error}</div>}

			{pinIssues.length > 0 && (
				<div className="fnc-pins">
					<strong>Pin conflicts ({pinIssues.length})</strong>
					<ul>
						{pinIssues.map((i) => (
							<li
								key={i.message}
								className={i.level === "error" ? "fnc-pin-err" : "fnc-pin-warn"}
							>
								{i.message}
							</li>
						))}
					</ul>
				</div>
			)}

			{showYaml && (
				<pre className="fnc-yaml">
					<code>{yamlOut}</code>
				</pre>
			)}

			<div className="fnc-body">
				<nav className="fnc-nav">
					{SECTION_GROUPS.map((g) => {
						const hasData = g.keys.some((k) => k in config);
						return (
							<button
								key={g.title}
								type="button"
								className={`fnc-nav-item ${g.title === section ? "active" : ""}`}
								onClick={() => setSection(g.title)}
							>
								{g.title}
								{hasData && <span className="fnc-dot" />}
							</button>
						);
					})}
				</nav>

				<main className="fnc-content">
					<Form
						key={activeGroup.title}
						schema={sectionSchema}
						formData={sectionData}
						validator={validator}
						widgets={{ TextWidget: PinAwareTextWidget }}
						formContext={{ usedPins }}
						idSeparator="/"
						experimental_defaultFormStateBehavior={{
							emptyObjectFields: "skipDefaults",
						}}
						liveValidate={false}
						showErrorList={false}
						onChange={(e) => mergeSection(e.formData)}
					>
						{/* no submit button; changes merge live into the config */}
						<span />
					</Form>
				</main>
			</div>
		</div>
	);
}
