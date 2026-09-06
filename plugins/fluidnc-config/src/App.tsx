import { useMemo, useState } from "react";
import Form from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import yaml from "js-yaml";
import schemaJson from "./vendor/fluidnc-config-schema.json";
// Board templates vendored from FluidNC's example_configs (GPL-3, same as gSender).
import tmpl4xAtc from "./vendor/4x_2209_atc.yaml?raw";
import tmpl4xAtcClass from "./vendor/4x_2209_atc_class.yaml?raw";
import tmplRp2040 from "./vendor/rp2040_3axis.yaml?raw";

const TEMPLATES: Record<string, string> = {
	"4-axis TMC2209 + ATC": tmpl4xAtc,
	"4-axis TMC2209 + ATC (class)": tmpl4xAtcClass,
	"RP2040 3-axis": tmplRp2040,
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

	const yamlOut = useMemo(() => {
		try {
			return yaml.dump(config, { noRefs: true, lineWidth: 120 });
		} catch (e) {
			return `# serialization error: ${e}`;
		}
	}, [config]);

	const loadYamlText = (text: string, name: string) => {
		try {
			const doc = yaml.load(text);
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
						const key = e.target.value;
						if (key) loadYamlText(TEMPLATES[key], `${key}.yaml`);
					}}
				>
					<option value="">Start from template…</option>
					{Object.keys(TEMPLATES).map((k) => (
						<option key={k} value={k}>
							{k}
						</option>
					))}
				</select>
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
