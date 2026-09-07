import { useMemo, useState } from "react";
import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import yaml from "js-yaml";
import schemaJson from "./vendor/fluidnc-config-schema.json";

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

// ponytail: rjsf renders the entire official schema generically. Custom pin
// widgets / section-by-section navigation come later if the flat form proves
// unwieldy on real configs.
export default function App() {
	const [config, setConfig] = useState<Record<string, unknown>>({});
	const [sourceName, setSourceName] = useState<string>("(new config)");
	const [error, setError] = useState<string>("");
	const [showYaml, setShowYaml] = useState(false);
	const [ghTemplates, setGhTemplates] = useState<
		{ label: string; path: string }[] | null
	>(null);
	const [ghLoading, setGhLoading] = useState(false);

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
			.then((text) => loadYamlText(text, path.split("/").pop() ?? "config.yaml"))
			.catch((e) => setError(`GitHub download failed: ${e}`));
	};

	const yamlOut = useMemo(() => {
		try {
			return yaml.dump(config, { noRefs: true, lineWidth: 120 });
		} catch (e) {
			return `# serialization error: ${e}`;
		}
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

	const openFile = (ev: React.ChangeEvent<HTMLInputElement>) => {
		const file = ev.target.files?.[0];
		if (!file) return;
		file.text().then((text) => loadYamlText(text, file.name));
		ev.target.value = "";
	};

	const download = () => {
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
				<button type="button" className="fnc-btn" onClick={download}>
					Download YAML
				</button>
				<button
					type="button"
					className="fnc-btn"
					onClick={() => setShowYaml((v) => !v)}
				>
					{showYaml ? "Hide YAML" : "View YAML"}
				</button>
			</header>

			{error && <div className="fnc-error">{error}</div>}

			{showYaml && (
				<pre className="fnc-yaml">
					<code>{yamlOut}</code>
				</pre>
			)}

			<Form
				schema={schema}
				formData={config}
				validator={validator}
				experimental_defaultFormStateBehavior={{
					emptyObjectFields: "skipDefaults",
				}}
				liveValidate={false}
				showErrorList="bottom"
				onChange={(e) => setConfig(e.formData ?? {})}
				onSubmit={() => download()}
			>
				<button type="submit" className="fnc-btn fnc-submit">
					Validate &amp; Download
				</button>
			</Form>
		</div>
	);
}
