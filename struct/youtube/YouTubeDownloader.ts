import ytdl from "@distube/ytdl-core";
import { readFileSync } from "fs";
import internal from "stream";

export class YouTubeDownloader {
	private agent = ytdl.createAgent([
		JSON.parse(readFileSync("./cookies.json", "utf8")),
	]);

	constructor() {}

	getBasicInfo(url: string) {
		return ytdl.getBasicInfo(url, { agent: this.agent });
	}

	getInfo(url: string) {
		return ytdl.getInfo(url, { agent: this.agent });
	}

	getMP3(url: string) {
		return this.toBuffer(
			ytdl(url, { filter: "audioonly", agent: this.agent })
		);
	}

	private async toBuffer(stream: internal.Readable): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			const _buf = Array<any>();

			stream.on("data", (chunk) => _buf.push(chunk));
			stream.on("end", () => resolve(Buffer.concat(_buf)));
			stream.on("error", (err) =>
				reject(`error converting stream - ${err}`)
			);
		});
	}
}
