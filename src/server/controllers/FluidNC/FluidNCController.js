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
import { FLUIDNC } from "./constants";

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
}

export default FluidNCController;
