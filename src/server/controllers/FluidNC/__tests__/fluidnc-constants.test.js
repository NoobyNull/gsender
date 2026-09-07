// Code written by: Claude (Anthropic), via Claude Code.
import {
	FLUIDNC_ERRORS,
	FLUIDNC_ALARMS,
	parseFluidNCVersion,
} from "../constants";
import { GRBL_ERRORS, GRBL_ALARMS } from "../../Grbl/constants";

describe("parseFluidNCVersion", () => {
	it("extracts version from the default startup banner", () => {
		expect(
			parseFluidNCVersion("Grbl 3.9 [FluidNC v3.9.1 (wifi) '$' for help]"),
		).toBe("FluidNC v3.9.1");
	});

	it("extracts dev-build git describe versions", () => {
		expect(
			parseFluidNCVersion(
				"Grbl 3.7 [FluidNC v3.7.1-pre1-22-g1234abcd (esp32-wroom) '$' for help]",
			),
		).toBe("FluidNC v3.7.1-pre1-22-g1234abcd");
	});

	it("returns null for plain Grbl banners and junk", () => {
		expect(parseFluidNCVersion("Grbl 1.1h ['$' for help]")).toBe(null);
		expect(parseFluidNCVersion("")).toBe(null);
		expect(parseFluidNCVersion(undefined)).toBe(null);
	});
});

describe("FluidNC error/alarm tables", () => {
	it("does not collide with Grbl error codes", () => {
		const grblCodes = new Set(GRBL_ERRORS.map((e) => e.code));
		for (const e of FLUIDNC_ERRORS) {
			expect(grblCodes.has(e.code)).toBe(false);
		}
	});

	it("does not collide with Grbl alarm codes", () => {
		const grblCodes = new Set(GRBL_ALARMS.map((a) => a.code));
		for (const a of FLUIDNC_ALARMS) {
			expect(grblCodes.has(a.code)).toBe(false);
		}
	});

	it("has unique codes within each table", () => {
		const errCodes = FLUIDNC_ERRORS.map((e) => e.code);
		expect(new Set(errCodes).size).toBe(errCodes.length);
		const alarmCodes = FLUIDNC_ALARMS.map((a) => a.code);
		expect(new Set(alarmCodes).size).toBe(alarmCodes.length);
	});

	it("resolves a FluidNC-specific error code (config invalid = 152)", () => {
		const table = [...GRBL_ERRORS, ...FLUIDNC_ERRORS];
		const err = table.find((e) => e.code === 152);
		expect(err.message).toBe("Configuration is invalid");
	});

	it("resolves a FluidNC-specific alarm code (unhomed = 14)", () => {
		const table = [...GRBL_ALARMS, ...FLUIDNC_ALARMS];
		const alarm = table.find((a) => a.code === 14);
		expect(alarm.message).toBe("Unhomed");
	});
});
