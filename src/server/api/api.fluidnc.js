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

// Server-side proxy to a FluidNC board's WebUI HTTP file API. The configurator
// plugin runs in a sandboxed same-origin page and cannot reach the board
// directly (FluidNC sends no CORS headers), so it calls these same-origin
// endpoints and the server relays to the board.

import logger from "../lib/logger";

const log = logger("api:fluidnc");

const BAD_REQUEST = 400;
const BAD_GATEWAY = 502;

// Only allow plain host[:port] targets — no schemes, paths, or credentials —
// so this can't be turned into an open proxy to arbitrary URLs.
const HOST_RE = /^[a-zA-Z0-9.\-]+(:\d{1,5})?$/;

const boardURL = (host, path) => {
	if (!host || !HOST_RE.test(host)) {
		return null;
	}
	return `http://${host}${path}`;
};

const TIMEOUT_MS = 8000;
const withTimeout = () => AbortSignal.timeout(TIMEOUT_MS);

// GET /api/fluidnc/files?host=<ip> — list the LocalFS file listing (JSON).
export const listFiles = async (req, res) => {
	const url = boardURL(req.query.host, "/files?action=list&path=/");
	if (!url) {
		return res.status(BAD_REQUEST).send({ msg: "Invalid host" });
	}
	try {
		const r = await fetch(url, { signal: withTimeout() });
		const body = await r.text();
		res.status(r.status).type("application/json").send(body);
	} catch (err) {
		log.error(`listFiles ${req.query.host}: ${err.message}`);
		res.status(BAD_GATEWAY).send({ msg: "Board unreachable", error: err.message });
	}
};

// GET /api/fluidnc/download?host=<ip>&name=config.yaml — fetch a file's contents.
// FluidNC serves files via GET /<name>; this may require WebUI auth above guest
// on boards that have a password set.
export const downloadFile = async (req, res) => {
	const { host, name } = req.query;
	if (!name || name.includes("..") || name.startsWith("/")) {
		return res.status(BAD_REQUEST).send({ msg: "Invalid file name" });
	}
	const url = boardURL(host, `/${encodeURIComponent(name)}`);
	if (!url) {
		return res.status(BAD_REQUEST).send({ msg: "Invalid host" });
	}
	try {
		const r = await fetch(url, { redirect: "manual", signal: withTimeout() });
		// A redirect means FluidNC bounced us to the WebUI — typically an auth
		// requirement. Surface that clearly instead of returning HTML.
		if (r.status >= 300 && r.status < 400) {
			return res.status(BAD_GATEWAY).send({
				msg: "Board redirected the download — the WebUI likely requires authentication for file access",
			});
		}
		const body = await r.text();
		res.status(r.status).type("text/plain").send(body);
	} catch (err) {
		log.error(`downloadFile ${host}/${name}: ${err.message}`);
		res.status(BAD_GATEWAY).send({ msg: "Board unreachable", error: err.message });
	}
};

// POST /api/fluidnc/upload?host=<ip>&name=config.yaml — write a file to LocalFS.
// Body is the raw file text (text/plain). Relayed to the board as the multipart
// upload its /files endpoint expects.
export const uploadFile = async (req, res) => {
	const { host, name } = req.query;
	if (!name || name.includes("..") || name.startsWith("/")) {
		return res.status(BAD_REQUEST).send({ msg: "Invalid file name" });
	}
	const url = boardURL(host, "/files");
	if (!url) {
		return res.status(BAD_REQUEST).send({ msg: "Invalid host" });
	}

	const chunks = [];
	req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
	req.on("end", async () => {
		try {
			const content = Buffer.concat(chunks);
			const form = new FormData();
			// FluidNC/ESP3D expects a size hint field named after the filename.
			form.append(`/${name}S`, String(content.length));
			form.append("path", "/");
			form.append(
				"myfile",
				new Blob([content], { type: "application/octet-stream" }),
				name,
			);
			const r = await fetch(url, {
				method: "POST",
				body: form,
				signal: withTimeout(),
			});
			const body = await r.text();
			res.status(r.status).type("application/json").send(body);
		} catch (err) {
			log.error(`uploadFile ${host}/${name}: ${err.message}`);
			res
				.status(BAD_GATEWAY)
				.send({ msg: "Board unreachable", error: err.message });
		}
	});
	req.on("error", (err) => {
		res.status(BAD_REQUEST).send({ msg: "Upload read error", error: err.message });
	});
};
