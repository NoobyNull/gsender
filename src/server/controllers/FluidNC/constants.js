/*
 * Code written by: Claude (Anthropic), via Claude Code.
 *
 * Copyright (C) 2026 gSender FluidNC fork contributors
 *
 * This file is part of gSender.
 *
 * gSender is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, under version 3 of the License.
 *
 * gSender is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gSender.  If not, see <https://www.gnu.org/licenses/>.
 */

// FluidNC (ESP32 Grbl-compatible firmware — https://github.com/bdring/FluidNC)
export const FLUIDNC = "FluidNC";

// Extract the real firmware version from a FluidNC startup banner, e.g.
// "Grbl 3.9 [FluidNC v3.9.1 (wifi) '$' for help]" -> "FluidNC v3.9.1".
// Returns null when the line carries no FluidNC info (custom start messages
// can omit it).
export const parseFluidNCVersion = (line) => {
	const m = String(line || "").match(/\[FluidNC ([^\s(\]]+)/i);
	return m ? `FluidNC ${m[1]}` : null;
};

// FluidNC-specific error codes beyond Grbl's 1-38.
// Transcribed from FluidNC/src/Error.h + Error.cpp.
export const FLUIDNC_ERRORS = [
	{ code: 39, message: "P param max exceeded", description: "P parameter exceeds the maximum supported value." },
	{ code: 40, message: "Check startup pins", description: "A control or limit input pin was active at startup." },
	{ code: 60, message: "Failed to mount device", description: "Filesystem (SD card or local flash) failed to mount." },
	{ code: 61, message: "Read failed", description: "Failed to read from the file or device." },
	{ code: 62, message: "Failed to open directory", description: "Failed to open the requested directory." },
	{ code: 63, message: "Directory not found", description: "The requested directory does not exist." },
	{ code: 64, message: "File empty", description: "The requested file is empty." },
	{ code: 65, message: "File not found", description: "The requested file does not exist." },
	{ code: 66, message: "Failed to open file", description: "Failed to open the requested file." },
	{ code: 67, message: "Device is busy", description: "The filesystem or device is busy." },
	{ code: 68, message: "Failed to delete directory", description: "Failed to delete the directory." },
	{ code: 69, message: "Failed to delete file", description: "Failed to delete the file." },
	{ code: 70, message: "Failed to rename file", description: "Failed to rename the file." },
	{ code: 80, message: "Number out of range for setting", description: "The value is outside the allowed range for this setting." },
	{ code: 81, message: "Invalid value for setting", description: "The value is not valid for this setting." },
	{ code: 82, message: "Failed to create file", description: "Failed to create the file." },
	{ code: 83, message: "Failed to format filesystem", description: "Failed to format the local filesystem." },
	{ code: 90, message: "Failed to send message", description: "Failed to deliver a message to the output channel." },
	{ code: 100, message: "Failed to store setting", description: "Non-volatile storage write failed." },
	{ code: 101, message: "Failed to get setting status", description: "Non-volatile storage read failed." },
	{ code: 110, message: "Authentication failed", description: "Authentication failed for the requested operation." },
	{ code: 111, message: "End of line", description: "End of line reached while reading input." },
	{ code: 112, message: "End of file", description: "End of file reached while reading input." },
	{ code: 113, message: "Reset asserted", description: "A reset was asserted while processing the command." },
	{ code: 120, message: "Another interface is busy", description: "Another interface (WebUI, telnet, serial) holds the connection." },
	{ code: 130, message: "Jog cancelled", description: "The jog command was cancelled before completion." },
	{ code: 150, message: "Bad pin specification", description: "A pin specification in the configuration is invalid." },
	{ code: 151, message: "Bad runtime config setting", description: "The runtime configuration setting is invalid." },
	{ code: 152, message: "Configuration is invalid", description: "The YAML configuration failed validation. Machine is in a config alarm state." },
	{ code: 160, message: "File upload failed", description: "File upload to the controller failed." },
	{ code: 161, message: "File download failed", description: "File download from the controller failed." },
	{ code: 162, message: "Read-only setting", description: "This setting cannot be changed at runtime." },
	{ code: 170, message: "Expression divide by zero", description: "Expression evaluation attempted to divide by zero." },
	{ code: 171, message: "Expression invalid argument", description: "Expression evaluation received an invalid argument." },
	{ code: 172, message: "Expression invalid result", description: "Expression evaluation produced an invalid result." },
	{ code: 173, message: "Expression unknown operator", description: "Expression contains an unknown operator." },
	{ code: 174, message: "Expression argument out of range", description: "Expression argument is out of range." },
	{ code: 175, message: "Expression syntax error", description: "Expression syntax is invalid." },
	{ code: 176, message: "Flow control syntax error", description: "Flow control (o-word) syntax is invalid." },
	{ code: 177, message: "Flow control not executing macro", description: "Flow control statement used outside a macro." },
	{ code: 178, message: "Flow control out of memory", description: "Flow control ran out of memory." },
	{ code: 179, message: "Flow control stack overflow", description: "Flow control nesting is too deep." },
	{ code: 180, message: "Parameter assignment failed", description: "Failed to assign the named parameter." },
	{ code: 181, message: "Gcode value word invalid", description: "A G-code value word is invalid." },
];

// FluidNC-specific alarm codes beyond Grbl's 1-9.
// Transcribed from FluidNC/src/Alarm.h.
export const FLUIDNC_ALARMS = [
	{ code: 10, message: "Spindle control", description: "Spindle control failure." },
	{ code: 11, message: "Startup pin active", description: "A control or limit input pin was active at startup. Clear the pin state and reset." },
	{ code: 12, message: "Ambiguous homing switch", description: "Multiple homing switches active at once — cannot determine which axis triggered." },
	{ code: 13, message: "Hard stop", description: "A hard stop was triggered." },
	{ code: 14, message: "Unhomed", description: "Machine must be homed before this operation. Run homing ($H)." },
	{ code: 15, message: "Init failure", description: "Initialization failure at startup." },
	{ code: 16, message: "Expander reset", description: "An I/O expander reset unexpectedly." },
	{ code: 17, message: "GCode error in file", description: "A G-code error occurred while running a file job." },
	{ code: 18, message: "Probe hard limit", description: "Probe triggered a hard limit." },
];
