// Code written by: Claude (Anthropic), via Claude Code.
import { useMemo, useState } from "react";
import Form from "@rjsf/core";
import type { RJSFSchema, WidgetProps } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import yaml from "js-yaml";
import schemaJson from "./vendor/fluidnc-config-schema.json";
import PinAwareTextWidget from "./PinWidget";

// Schema descriptions are long maintainer notes. Render them as a hover "ⓘ"
// next to the field instead of a wall of text under it.
function HelpTooltip({ description }: { description?: unknown }) {
	const text = typeof description === "string" ? description.trim() : "";
	if (!text) return null;
	return (
		<span className="fnc-help" title={text} aria-label={text}>
			ⓘ
		</span>
	);
}

// Apple-style toggle switch.
function Toggle({
	on,
	onChange,
	label,
}: {
	on: boolean;
	onChange: (v: boolean) => void;
	label?: string;
}) {
	return (
		<label className="fnc-switch">
			<input
				type="checkbox"
				checked={on}
				onChange={(e) => onChange(e.target.checked)}
			/>
			<span className="fnc-switch-track">
				<span className="fnc-switch-thumb" />
			</span>
			{label && <span className="fnc-switch-label">{label}</span>}
		</label>
	);
}

// rjsf boolean widget: field name on the left, Apple toggle on the right —
// consistent with the other horizontal rows.
function ToggleWidget(props: WidgetProps) {
	return (
		<div className="fnc-bool-row">
			<span className="fnc-bool-label">{props.label}</span>
			<Toggle on={props.value === true} onChange={(v) => props.onChange(v)} />
		</div>
	);
}

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

// Every pin field references pinAny = oneOf:[pin, pinDeprecated], which rjsf
// renders as a useless "Option 1 / Option 2" type selector. Collapse it to the
// plain pin string so each pin renders as a single field (our PinWidget). The
// deprecated pinext syntax still loads fine — it's just a string.
const schema = structuredClone(schemaJson) as RJSFSchema;
if (schema.$defs?.pinAny && schema.$defs.pin) {
	schema.$defs.pinAny = { ...schema.$defs.pin, default: "NO_PIN" };
}

// oneOf/anyOf branches (e.g. the motor driver picker: standard_stepper,
// tmc_2209, …) carry no title, so rjsf labels them "Option 1..N". Title each
// branch by the property it selects, turning the selector into a real
// driver/type picker that reveals only that choice's fields.
const titleOneOfBranches = (node: unknown): void => {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		node.forEach(titleOneOfBranches);
		return;
	}
	const obj = node as Record<string, unknown>;
	for (const key of ["oneOf", "anyOf"]) {
		const branches = obj[key];
		if (Array.isArray(branches)) {
			for (const b of branches) {
				if (b && typeof b === "object" && !("title" in b)) {
					const req = (b as { required?: string[] }).required?.[0];
					const props = (b as { properties?: object }).properties;
					const name = req || (props && Object.keys(props)[0]);
					if (name) (b as { title?: string }).title = name;
				}
			}
		}
	}
	for (const v of Object.values(obj)) titleOneOfBranches(v);
};
titleOneOfBranches(schema);

// Some fields are intentionally typeless in the schema (e.g. `meta` free-form
// notes, and the on/off flags). rjsf can't render a typeless field ("Unknown
// field type undefined"), which dumps a huge unwrapped error and blows out the
// layout width. Assign a type to every schema leaf that has none: known flags
// become booleans (nice toggles), everything else a string.
const BOOL_KEYS = new Set([
	"verbose_errors",
	"report_inches",
	"use_line_numbers",
	"enable_parking_override_control",
]);
const STRUCTURAL = [
	"type",
	"$ref",
	"properties",
	"oneOf",
	"anyOf",
	"allOf",
	"patternProperties",
	"enum",
	"items",
];
const fixTypelessLeaves = (node: unknown, key?: string): void => {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		node.forEach((n) => fixTypelessLeaves(n));
		return;
	}
	const obj = node as Record<string, unknown>;
	if ("description" in obj && !STRUCTURAL.some((k) => k in obj)) {
		obj.type = key && BOOL_KEYS.has(key) ? "boolean" : "string";
	}
	for (const [k, v] of Object.entries(obj)) fixTypelessLeaves(v, k);
};
fixTypelessLeaves(schema);

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
	{
		// uartN / uart_channelN / i2cN are schema patternProperties (any index
		// is legal); we surface the indexes pendants and displays actually use.
		title: "Pendant, UART & Display",
		keys: [
			"oled",
			"i2c0",
			"i2c1",
			"uart1",
			"uart2",
			"uart_channel1",
			"uart_channel2",
		],
	},
];

// Resolve a top-level key to its schema: explicit property, or the matching
// patternProperties entry (uart1, uart_channel1, i2c0, ...).
const schemaForKey = (key: string): unknown => {
	const props = (schema.properties ?? {}) as Record<string, unknown>;
	if (key in props) return props[key];
	for (const [pattern, sub] of Object.entries(
		(schema as { patternProperties?: Record<string, unknown> })
			.patternProperties ?? {},
	)) {
		if (new RegExp(pattern).test(key)) return sub;
	}
	return undefined;
};

// Does a top-level key hold an object section (collapsible) or a scalar field
// (always shown)? Resolves a $ref into $defs before checking.
const resolveRef = (node: unknown): Record<string, unknown> => {
	let cur = node as Record<string, unknown>;
	const defs = (schema.$defs ?? {}) as Record<string, unknown>;
	for (let i = 0; i < 5 && cur && typeof cur.$ref === "string"; i++) {
		const name = cur.$ref.replace("#/$defs/", "");
		cur = defs[name] as Record<string, unknown>;
	}
	return cur ?? {};
};

const isObjectKey = (key: string): boolean => {
	const resolved = resolveRef(schemaForKey(key));
	const t = resolved.type;
	const type = Array.isArray(t) ? t : [t];
	return (
		type.includes("object") ||
		"properties" in resolved ||
		"patternProperties" in resolved ||
		"oneOf" in resolved
	);
};

// A collapsible section with an Apple-style enable toggle. Off = the key is
// absent from config and the body is hidden; on = key present and its form
// renders.
function CollapsibleSection({
	sectionKey,
	present,
	onToggle,
	children,
}: {
	sectionKey: string;
	present: boolean;
	onToggle: (on: boolean) => void;
	children: React.ReactNode;
}) {
	return (
		<div className={`fnc-section ${present ? "open" : ""}`}>
			<div className="fnc-section-head">
				<Toggle on={present} onChange={onToggle} />
				<span className="fnc-section-title">{sectionKey}</span>
				<HelpTooltip description={resolveRef(schemaForKey(sectionKey)).description} />
			</div>
			{present && <div className="fnc-section-body">{children}</div>}
		</div>
	);
}

// One-click starting points for common pendant/display hardware.
// FluidDial wired mode: 1M baud 8N1 + uart_channel with 75ms reporting
// (per FluidNC wiki / bdring's published examples).
const HARDWARE_PRESETS: {
	label: string;
	snippet: Record<string, unknown>;
}[] = [
	{
		label: "FluidDial pendant (wired, UART1)",
		snippet: {
			uart1: {
				txd_pin: "gpio.4",
				rxd_pin: "gpio.16",
				baud: 1000000,
				mode: "8N1",
			},
			uart_channel1: { uart_num: 1, report_interval_ms: 75 },
		},
	},
	{
		label: "OLED status display (I2C 128x64)",
		snippet: {
			i2c0: { sda_pin: "gpio.21", scl_pin: "gpio.22" },
			oled: {
				i2c_num: 0,
				i2c_address: 60,
				width: 128,
				height: 64,
				report_interval_ms: 500,
			},
		},
	},
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

const AXIS_LETTERS = ["x", "y", "z", "a", "b", "c"];
const AXIS_LEVEL_KEYS = [
	"shared_stepper_disable_pin",
	"shared_stepper_reset_pin",
	"homing_runs",
];

// Common Form props shared by every section render.
type FormProps = Omit<
	React.ComponentProps<typeof Form>,
	"schema" | "formData" | "onChange"
>;

// Custom Axes editor: all six axes (X/Y/Z/A/B/C) are always-visible sub-tabs;
// each has an Enable toggle that adds/removes it from the config. Axis-level
// shared pins sit above the tabs.
function AxesEditor({
	axes,
	setAxes,
	formProps,
}: {
	axes: Record<string, unknown>;
	setAxes: (next: Record<string, unknown>) => void;
	formProps: FormProps;
}) {
	const [active, setAxis] = useState("x");

	const axisSchema = {
		...(schema.$defs?.axisLetter as object),
		$defs: schema.$defs,
	} as RJSFSchema;
	const levelSchema = {
		type: "object",
		properties: pick(
			(schema.$defs?.axesSection as { properties: Record<string, unknown> })
				.properties,
			AXIS_LEVEL_KEYS,
		) as RJSFSchema["properties"],
		$defs: schema.$defs,
	} as RJSFSchema;

	const levelData = pick(axes, AXIS_LEVEL_KEYS);
	const axisData = (axes[active] ?? {}) as Record<string, unknown>;

	return (
		<div>
			<Form
				{...formProps}
				schema={levelSchema}
				formData={levelData}
				formContext={{ ...formProps.formContext, pathPrefix: "axes" }}
				onChange={(e) => {
					const next = { ...axes };
					for (const k of AXIS_LEVEL_KEYS) delete next[k];
					setAxes({ ...next, ...(e.formData ?? {}) });
				}}
			>
				<span />
			</Form>

			<div className="fnc-axis-tabs">
				{AXIS_LETTERS.map((a) => (
					<button
						key={a}
						type="button"
						className={`fnc-axis-tab ${a === active ? "active" : ""}`}
						onClick={() => setAxis(a)}
					>
						{a.toUpperCase()}
						{a in axes && <span className="fnc-dot" />}
					</button>
				))}
			</div>

			<div className="fnc-axis-enable">
				<span className="fnc-bool-label">Enable {active.toUpperCase()} axis</span>
				<Toggle
					on={active in axes}
					onChange={(on) => {
						const next = { ...axes };
						if (on) {
							next[active] = axes[active] ?? {};
						} else {
							delete next[active];
						}
						setAxes(next);
					}}
				/>
			</div>

			{active in axes ? (
				<Form
					{...formProps}
					key={active}
					schema={axisSchema}
					formData={axisData}
					formContext={{
						...formProps.formContext,
						pathPrefix: `axes.${active}`,
					}}
					onChange={(e) => setAxes({ ...axes, [active]: e.formData ?? {} })}
				>
					<span />
				</Form>
			) : (
				<p className="fnc-axis-off">
					{active.toUpperCase()} axis is disabled. Enable it to configure.
				</p>
			)}
		</div>
	);
}

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

// Renders a section group: scalar fields in one always-shown form, and each
// object sub-section as a collapsible card with an Apple enable toggle.
function SectionEditor({
	group,
	config,
	setConfig,
	formProps,
}: {
	group: { title: string; keys: string[] };
	config: Record<string, unknown>;
	setConfig: (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
	formProps: FormProps;
}) {
	const scalarKeys = group.keys.filter(
		(k) => schemaForKey(k) && !isObjectKey(k),
	);
	const objectKeys = group.keys.filter((k) => isObjectKey(k));

	const scalarSchema = {
		type: "object",
		properties: Object.fromEntries(
			scalarKeys.map((k) => [k, schemaForKey(k)]),
		) as RJSFSchema["properties"],
		$defs: schema.$defs,
	} as RJSFSchema;

	return (
		<div>
			{scalarKeys.length > 0 && (
				<Form
					{...formProps}
					schema={scalarSchema}
					formData={pick(config, scalarKeys)}
					onChange={(e) => {
						const data = (e.formData ?? {}) as Record<string, unknown>;
						setConfig((prev) => {
							const next = { ...prev };
							for (const k of scalarKeys) delete next[k];
							return { ...next, ...data };
						});
					}}
				>
					<span />
				</Form>
			)}

			{objectKeys.map((k) => (
				<CollapsibleSection
					key={k}
					sectionKey={k}
					present={k in config}
					onToggle={(on) =>
						setConfig((prev) => {
							if (on) return { ...prev, [k]: prev[k] ?? {} };
							const next = { ...prev };
							delete next[k];
							return next;
						})
					}
				>
					<Form
						{...formProps}
						schema={{ ...resolveRef(schemaForKey(k)), $defs: schema.$defs } as RJSFSchema}
						formData={(config[k] ?? {}) as Record<string, unknown>}
						formContext={{ ...formProps.formContext, pathPrefix: k }}
						onChange={(e) =>
							setConfig((prev) => ({ ...prev, [k]: e.formData ?? {} }))
						}
					>
						<span />
					</Form>
				</CollapsibleSection>
			))}
		</div>
	);
}

export default function App() {
	const [config, setConfig] = useState<Record<string, unknown>>({});
	const [sourceName, setSourceName] = useState<string>("(new config)");
	const [error, setError] = useState<string>("");
	const [showYaml, setShowYaml] = useState(true);
	const [section, setSection] = useState(SECTION_GROUPS[0].title);
	const [ghTemplates, setGhTemplates] = useState<
		{ label: string; path: string }[] | null
	>(null);
	const [ghLoading, setGhLoading] = useState(false);
	const [boardHost, setBoardHost] = useState("127.0.0.1");
	const [boardBusy, setBoardBusy] = useState("");
	const [boardMsg, setBoardMsg] = useState("");

	const activeGroup =
		SECTION_GROUPS.find((g) => g.title === section) ?? SECTION_GROUPS[0];

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

	const commonFormProps: FormProps = {
		validator,
		widgets: { TextWidget: PinAwareTextWidget, CheckboxWidget: ToggleWidget },
		templates: { DescriptionFieldTemplate: HelpTooltip },
		formContext: { usedPins },
		idSeparator: "/",
		experimental_defaultFormStateBehavior: {
			emptyObjectFields: "skipDefaults",
		},
		liveValidate: false,
		showErrorList: false,
	};

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

	// Board sync via gSender's same-origin FluidNC proxy (server relays to the
	// board's WebUI HTTP file API — the sandbox can't reach the board directly).
	const loadFromBoard = () => {
		setBoardBusy("load");
		setBoardMsg("");
		fetch(
			`/api/fluidnc/download?host=${encodeURIComponent(boardHost)}&name=config.yaml`,
		)
			.then(async (r) => {
				const text = await r.text();
				if (!r.ok) {
					let msg = text;
					try {
						msg = JSON.parse(text).msg || text;
					} catch {
						/* plain text */
					}
					throw new Error(msg);
				}
				loadYamlText(text, `config.yaml (from ${boardHost})`);
				setBoardMsg(`Loaded config.yaml from ${boardHost}`);
			})
			.catch((e) => setBoardMsg(`Load failed: ${e.message}`))
			.finally(() => setBoardBusy(""));
	};

	const saveToBoard = () => {
		setBoardBusy("save");
		setBoardMsg("");
		fetch(
			`/api/fluidnc/upload?host=${encodeURIComponent(boardHost)}&name=config.yaml`,
			{
				method: "POST",
				headers: { "Content-Type": "text/plain" },
				body: yamlOut,
			},
		)
			.then(async (r) => {
				const text = await r.text();
				if (!r.ok) {
					let msg = text;
					try {
						msg = JSON.parse(text).msg || text;
					} catch {
						/* plain text */
					}
					throw new Error(msg);
				}
				setBoardMsg(
					`Saved config.yaml to ${boardHost}. Restart the controller ($Bye) to apply.`,
				);
			})
			.catch((e) => setBoardMsg(`Save failed: ${e.message}`))
			.finally(() => setBoardBusy(""));
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

			<div className="fnc-board">
				<span className="fnc-board-label">Board</span>
				<input
					className="fnc-board-host"
					value={boardHost}
					onChange={(e) => setBoardHost(e.target.value)}
					placeholder="IP or hostname"
					aria-label="Board IP or hostname"
				/>
				<button
					type="button"
					className="fnc-btn"
					disabled={!!boardBusy}
					onClick={loadFromBoard}
				>
					{boardBusy === "load" ? "Loading…" : "Load from board"}
				</button>
				<button
					type="button"
					className="fnc-btn fnc-primary"
					disabled={!!boardBusy}
					onClick={saveToBoard}
				>
					{boardBusy === "save" ? "Saving…" : "Save to board"}
				</button>
				{boardMsg && <span className="fnc-board-msg">{boardMsg}</span>}
			</div>

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

			<div className={`fnc-body ${showYaml ? "with-yaml" : ""}`}>
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
					{activeGroup.title === "Pendant, UART & Display" && (
						<div className="fnc-presets">
							{HARDWARE_PRESETS.map((p) => (
								<button
									key={p.label}
									type="button"
									className="fnc-btn"
									onClick={() =>
										setConfig((prev) => ({ ...prev, ...p.snippet }))
									}
								>
									+ {p.label}
								</button>
							))}
							<span className="fnc-preset-hint">
								Presets insert typical wiring — adjust pins to your board.
							</span>
						</div>
					)}
					{activeGroup.title === "Axes" ? (
						<AxesEditor
							axes={(config.axes ?? {}) as Record<string, unknown>}
							setAxes={(next) =>
								setConfig((prev) => ({ ...prev, axes: next }))
							}
							formProps={commonFormProps}
						/>
					) : (
						<SectionEditor
							key={activeGroup.title}
							group={activeGroup}
							config={config}
							setConfig={setConfig}
							formProps={commonFormProps}
						/>
					)}
				</main>

				{showYaml && (
					<aside className="fnc-yaml-pane">
						<div className="fnc-yaml-head">config.yaml (live)</div>
						<pre className="fnc-yaml">
							<code>{yamlOut}</code>
						</pre>
					</aside>
				)}
			</div>
		</div>
	);
}
