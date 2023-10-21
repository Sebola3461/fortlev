import { AudioResource, createAudioResource } from "@discordjs/voice";
import { randomUUID } from "crypto";
import { AttachmentBuilder, User } from "discord.js";

import { Beatmapset } from "../../types/beatmap";
import { bufferToStream } from "../../utils/transformers/bufferToStream";
import { changeAudioRate } from "../../utils/transformers/changeAudioRate";
import truncateString from "../../utils/transformers/truncateString";

export class Song {
	public title: string;
	public url: string;
	public thumbnail: string;
	private audioFile: Buffer;
	public user: User;
	public duration: number;
	public id = randomUUID();
	public playbackRate = 1;
	public volume = 1;

	constructor(
		title: string,
		url: string,
		thumbnail: string,
		user: User,
		audioFile: Buffer,
		duration: number
	) {
		this.title = title;
		this.url = url;
		this.thumbnail = thumbnail;
		this.audioFile = audioFile;
		this.user = user;

		this.duration = duration;
	}

	public getAudio() {
		return createAudioResource(bufferToStream(this.audioFile), {
			inlineVolume: true,
		});
	}

	public setStaticVolume(volume: number) {
		this.volume = volume;

		return this.volume;
	}

	public toAttachment() {
		const attachment = new AttachmentBuilder(this.audioFile, {
			name: `${truncateString(this.title, 50)}.mp3`,
		});

		return attachment;
	}
}
