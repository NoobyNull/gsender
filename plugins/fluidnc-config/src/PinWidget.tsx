import type { WidgetProps } from "@rjsf/utils";
import { getDefaultRegistry } from "@rjsf/core";
import { ESP32_PINS, PIN_BY_NAME, parsePin, formatPin } from "./pins";

const DefaultText = getDefaultRegistry().widgets.TextWidget;

// rjsf id ("root/axes/x/motor0/step_pin" with idSeparator="/") -> config path
// in the same format collectPins produces ("axes.x.motor0.step_pin").
const idToPath = (id: string) =>
	id
		.replace(/^root\/?/, "")
		.split("/")
		.map((s) => (/^\d+$/.test(s) ? `[${s}]` : s))
		.join(".")
		.replace(/\.\[/g, "[");

const isPinSchema = (schema: WidgetProps["schema"], id: string) =>
	(typeof schema.description === "string" &&
		schema.description.startsWith("FluidNC pin string")) ||
	/_pin$/.test(id.split("/").pop() ?? "");

/**
 * Drop-in TextWidget replacement: renders FluidNC pin fields as a dropdown
 * (with per-pin ESP32 capability info), a pull selector, and an invert
 * checkbox — with pins already assigned elsewhere marked in the list.
 * Non-pin string fields fall through to the default text widget.
 * Ported from fluid-installer's PinField (GPL-3).
 */
export default function PinAwareTextWidget(props: WidgetProps) {
	const { schema, id, value, onChange, formContext } = props;

	if (!isPinSchema(schema, id)) {
		return <DefaultText {...props} />;
	}

	const usedPins: Map<string, string[]> = formContext?.usedPins ?? new Map();
	const selfPath = idToPath(id);
	const parsed = parsePin(value);
	const def = PIN_BY_NAME.get(parsed.base);

	const otherUsers = (usedPins.get(parsed.base) ?? []).filter(
		(p) => p !== selfPath,
	);

	const update = (patch: Partial<ReturnType<typeof parsePin>>) => {
		onChange(formatPin({ ...parsed, ...patch }));
	};

	return (
		<div className="fnc-pin">
			<div className="fnc-pin-row">
				<select
					id={id}
					value={PIN_BY_NAME.has(parsed.base) ? parsed.base : "__custom"}
					onChange={(e) => {
						if (e.target.value !== "__custom") {
							const nd = PIN_BY_NAME.get(e.target.value);
							update({
								base: e.target.value,
								// drop a pull that the new pin can't do
								pull: nd?.pull ? parsed.pull : "",
							});
						}
					}}
				>
					{!PIN_BY_NAME.has(parsed.base) && (
						<option value="__custom">{parsed.base} (custom)</option>
					)}
					{ESP32_PINS.map((p) => {
						const users = (usedPins.get(p.pin) ?? []).filter(
							(u) => u !== selfPath,
						);
						const inUse = users.length > 0;
						return (
							<option
								key={p.pin}
								value={p.pin}
								disabled={p.restricted}
							>
								{p.pin}
								{p.restricted ? " — restricted" : ""}
								{inUse ? ` — in use (${users[0]})` : ""}
							</option>
						);
					})}
				</select>

				{parsed.base !== "NO_PIN" && def?.pull && (
					<select
						aria-label="Pull resistor"
						value={parsed.pull}
						onChange={(e) =>
							update({ pull: e.target.value as "" | "pu" | "pd" })
						}
					>
						<option value="">No pull</option>
						<option value="pu">Pull up</option>
						<option value="pd">Pull down</option>
					</select>
				)}

				{parsed.base !== "NO_PIN" && (
					<label className="fnc-pin-invert">
						<input
							type="checkbox"
							checked={parsed.inverted}
							onChange={(e) => update({ inverted: e.target.checked })}
						/>
						Invert
					</label>
				)}
			</div>

			{def?.comment && <div className="fnc-pin-note">{def.comment}</div>}

			{otherUsers.length > 0 && (
				<div className="fnc-pin-conflict">
					⚠ This pin is already used by: {otherUsers.join(", ")}
				</div>
			)}
		</div>
	);
}
