/*
 * Firmware auto-detection routing (Connection data listener).
 *
 * FluidNC banners contain "Grbl" as a compat shim, so detection order
 * matters: FluidNC must be identified before the generic grbl match.
 */

jest.mock("../SerialConnection", () =>
	jest.fn().mockImplementation(() => ({
		on: jest.fn(),
		open: jest.fn(),
	})),
);

jest.mock("../logger", () => () => ({
	debug: jest.fn(),
	silly: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	info: jest.fn(),
}));

import Connection from "../Connection";
import { GRBL } from "../../controllers/Grbl/constants";
import { GRBLHAL } from "../../controllers/Grblhal/constants";
import { FLUIDNC } from "../../controllers/FluidNC/constants";

const detect = (line) => {
	const conn = new Connection(
		{ io: null },
		"/dev/ttyTEST",
		{ baudrate: 115200 },
		() => {},
	);
	conn.controllerType = null;
	let found = null;
	conn.on("firmwareFound", (type) => {
		found = type;
	});
	conn.connectionEventListener.data(line);
	clearInterval(conn.timeout);
	return { found, type: conn.controllerType };
};

describe("Connection firmware detection", () => {
	it("routes FluidNC startup banner to the FluidNC controller", () => {
		const r = detect("Grbl 3.7 [FluidNC v3.9.1 (wifi) '$' for help]");
		expect(r.found).toBe(FLUIDNC);
		expect(r.type).toBe(FLUIDNC);
	});

	it("routes FluidNC $I VER response to the FluidNC controller", () => {
		const r = detect("[VER:3.9 FluidNC v3.9.1:]");
		expect(r.found).toBe(FLUIDNC);
	});

	it("still routes plain Grbl banners to the Grbl controller", () => {
		const r = detect("Grbl 1.1h ['$' for help]");
		expect(r.found).toBe(GRBL);
	});

	it("still routes grblHAL banners to the grblHAL controller", () => {
		const r = detect("GrblHAL 1.1f ['$' or '$HELP' for help]");
		expect(r.found).toBe(GRBLHAL);
	});

	it("ignores non-firmware lines", () => {
		const r = detect("ok");
		expect(r.found).toBe(null);
		expect(r.type).toBe(null);
	});
});
