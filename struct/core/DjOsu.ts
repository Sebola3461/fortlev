import {
	ActivityType,
	ButtonInteraction,
	Client,
	GuildMember,
	Interaction,
} from "discord.js";
import { existsSync, mkdirSync } from "fs";
import path from "path";

import { handleMusicSearch } from "../autocomplete/handleMusicSearch";
import { handleMusicSkip } from "../autocomplete/handleMusicSkip";
import { CommandsManager } from "../commands/CommandsManager";
import { LoggerService } from "../general/LoggerService";
import { MusicQueueManager } from "./MusicQueueManager";

export class DjOsu extends Client {
	private logger = new LoggerService("DjOsu");
	public commands = new CommandsManager(this);
	public queues = new MusicQueueManager(this);

	constructor() {
		super({
			intents: [
				"GuildMembers",
				"GuildVoiceStates",
				"Guilds",
				"MessageContent",
			],
		});
	}

	async initialize() {
		this.logger.printWarning("Initializing Fortlev...");

		this.checkCacheFolders();

		this.loadFFMPEG();

		this.updateStatus.bind(this);

		this.login(process.env.TOKEN)
			.then(() => {
				this.logger.printSuccess(
					`Connected to discord as ${this.user?.username}`
				);

				this.commands.initializeCommands();
				this.on("interactionCreate", this.handleInteraction.bind(this));

				setInterval(() => this.updateStatus(), 10000);
			})
			.catch((error) =>
				this.logger.printError("Cannot connect to discord:", error)
			);
	}

	private updateStatus() {
		const statuses = [
			{
				type: ActivityType.Listening,
				name: "Kanalha - Fraquinha",
			},
			{
				type: ActivityType.Watching,
				name: "Pornhub - Biggest BBC ever!",
			},
			{
				type: ActivityType.Playing,
				name: "á 90 graus igual orlando",
			},
			{
				type: ActivityType.Watching,
				name: "Youtube - Como aumentar o pau",
			},
			{
				type: ActivityType.Playing,
				name: "a raba",
			},
			{
				type: ActivityType.Playing,
				name: "Nekopara Vol. II",
			},
			{
				type: ActivityType.Playing,
				name: "musica nessa porra",
			},
			{
				type: ActivityType.Playing,
				name: "daquele jeitão",
			},
		];

		if (this.user)
			this.user.setPresence({
				status: "online",
				activities: [
					{
						type: statuses[
							Math.floor(Math.random() * statuses.length)
						].type as any,
						name: statuses[
							Math.floor(Math.random() * statuses.length)
						].name,
					},
				],
			});
	}

	public async handleEmbedInteractions(button: ButtonInteraction) {
		const targets = button.customId.split(",");

		if (targets[0] != "global" || !button.guildId || !button.member) return;

		await button.deferUpdate();

		const action = targets[1] as
			| "previousSong"
			| "pauseSong"
			| "loopSong"
			| "nextSong"
			| "queue"
			| "download"
			| "time";

		const queue = this.queues.getQueue(button.guildId);

		if (!queue) return;

		switch (action) {
			case "previousSong":
				if (
					!queue.checkManagePermissionsFor(
						button.member as GuildMember
					)
				)
					return;

				queue.previousSong();
				break;
			case "nextSong":
				if (
					!queue.checkManagePermissionsFor(
						button.member as GuildMember
					)
				)
					return;

				if (!queue.hasNext()) return;

				queue.skipSong();
				break;
			case "pauseSong":
				if (
					!queue.checkManagePermissionsFor(
						button.member as GuildMember
					)
				)
					return;

				queue.pause();
				button.editReply({
					components: queue.getPlayingEmbedButtons(),
				});
				break;
			case "loopSong":
				if (
					!queue.checkAdminPermissionsFor(
						button.member as GuildMember
					)
				)
					return;

				queue.setLoop(!queue.loop);
				queue.sendUpdateMessage();
				break;
			case "queue":
				button.followUp(queue.generateList());
				break;
			case "time":
				queue.editUpdateMessage();
				button.deleteReply();
				break;
			case "download":
				if (!queue) return;

				const song = queue.getCurrentSong();

				if (!song) return;

				const attachment = song.toAttachment();

				button.followUp({
					files: [attachment],
				});
				break;
		}
	}

	handleInteraction(interaction: Interaction) {
		if (interaction.isChatInputCommand())
			this.commands.handleCommandInteraction(interaction);

		if (interaction.isAutocomplete()) {
			handleMusicSearch(interaction);
			handleMusicSkip(interaction);
		}

		if (interaction.isButton()) this.handleEmbedInteractions(interaction);
	}

	private loadFFMPEG() {
		if (process.env.OS == "Windows_NT") {
			process.env.FFMPEG_PATH = path.resolve("./bin/ffmpeg.exe");
			process.env.FFMPROBE_PATH = path.resolve("./bin/ffmprobe.exe");
		}
	}

	private checkCacheFolders() {
		if (!existsSync(path.resolve("./cache")))
			mkdirSync(path.resolve("./cache"));

		if (!existsSync(path.resolve("./cache/staging")))
			mkdirSync(path.resolve("./cache/staging"));

		if (!existsSync(path.resolve("./cache/beatmapsets")))
			mkdirSync(path.resolve("./cache/beatmapsets"));

		if (!existsSync(path.resolve("./cache/rateChange")))
			mkdirSync(path.resolve("./cache/rateChange"));
	}
}
