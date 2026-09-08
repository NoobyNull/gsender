/*
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

import GrblController from "../Grbl/GrblController";
import { GRBL_ERRORS, GRBL_ALARMS } from "../Grbl/constants";
import {
	FLUIDNC,
	FLUIDNC_ERRORS,
	FLUIDNC_ALARMS,
	parseFluidNCVersion,
} from "./constants";

/**
 * FluidNC controller.
 *
 * FluidNC (https://github.com/bdring/FluidNC) is wire-compatible with Grbl
 * v1.1: same realtime commands, same status reports, same ok/error protocol,
 * and its `$$` output ($path/style/keys=value) already parses with the Grbl
 * settings parser. The Grbl controller therefore drives it correctly, and
 * state events intentionally continue to identify as Grbl so the entire UI
 * (DRO, jogging, visualizer, job control) works unchanged.
 *
 * This subclass exists to:
 *  - identify the connection as FluidNC (`type`), so the client can show the
 *    real firmware and hide Grbl-EEPROM-specific tooling that would corrupt
 *    a FluidNC yaml config;
 *  - be the place FluidNC-specific behavior lands (config filesystem, $ command
 *    extensions, WebUI coexistence) as hardware testing surfaces needs.
 */
// ponytail: deliberately thin — add overrides only when a real FluidNC board
// proves they're needed, not speculatively.
class FluidNCController extends GrblController {
	type = FLUIDNC;

	// FluidNC extends Grbl's error codes (39+) and alarm codes (10+);
	// see FluidNC/src/Error.h and Alarm.h.
	errorTable = [...GRBL_ERRORS, ...FLUIDNC_ERRORS];

	alarmTable = [...GRBL_ALARMS, ...FLUIDNC_ALARMS];

	constructor(...args) {
		super(...args);

		// The default FluidNC banner is "Grbl <maj.min> [FluidNC <git_info> ...]"
		// (FluidNC/src/SettingsDefinitions.cpp: "Grbl \V [FluidNC \B (\X) \H]"),
		// so the Grbl startup parser reports the compat-shim version ("3.9").
		// Surface the real firmware version instead. The periodic settings-sync
		// in GrblController pushes any new runner.settings object to the UI.
		this.runner.on("startup", (res) => {
			const version = parseFluidNCVersion(res.raw);
			if (version) {
				this.runner.settings = {
					...this.runner.settings,
					version,
				};
			}
		});
	}
}

export default FluidNCController;
