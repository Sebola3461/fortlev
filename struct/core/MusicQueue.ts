import {
	AudioPlayer,
	AudioPlayerPlayingState,
	AudioPlayerStatus,
	createAudioPlayer,
	joinVoiceChannel,
	NoSubscriberBehavior,
	VoiceConnection,
	VoiceConnectionSignallingState,
} from "@discordjs/voice";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	ColorResolvable,
	EmbedBuilder,
	Guild,
	GuildMember,
	GuildTextBasedChannel,
	InteractionCollector,
	Message,
	TextBasedChannel,
	VoiceBasedChannel,
} from "discord.js";
import { rmSync } from "fs";
import path from "path";
import { djosu } from "../..";
import { colors } from "../../constants/colors";
import timeString from "../../utils/transformers/timeString";
import { DjOsu } from "./DjOsu";
import { Song } from "./Song";
import { createConnection } from "net";
import { generateTextProgressBar } from "../../utils/transformers/generateTextProgressBar";
import { percentageOf } from "../../utils/transformers/percentageOf";
import { percentageOfTotal } from "../../utils/transformers/percentageOfTotal";
import { generateChunks } from "../../utils/transformers/arrayChunk";
import { randomUUID } from "crypto";

export enum SongRemoveStatus {
	Destroyed,
	Skip,
	Previous,
	None,
}

export class MusicQueue {
	public bot!: DjOsu;
	public voiceChannel: VoiceBasedChannel;
	public readonly guildId: string;
	public channelId: string;
	public connection: VoiceConnection;
	public readonly player: AudioPlayer;
	public textChannel!: TextBasedChannel;

	// Controls
	public loop = false;

	// resources
	private currentSongIndex = 0;
	public volumeIndexes = [
		0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1,
	];
	public volume = 10;

	// message
	private lastStatusMessage: Message | null = null;

	private songs: Song[] = [];

	private afkDestroyTimeout: NodeJS.Timeout | null = null;
	private isLocked = false;

	constructor(options: { bot: DjOsu; channel: VoiceBasedChannel }) {
		this.player = createAudioPlayer({
			behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
		});

		this.guildId = options.channel.guildId;
		this.channelId = options.channel.id;

		this.voiceChannel = options.channel;

		this.connection = joinVoiceChannel({
			channelId: this.channelId,
			guildId: this.guildId,
			adapterCreator: options.channel.guild.voiceAdapterCreator,
		});

		this.connection.subscribe(this.player);

		this.skipSong.bind(this);
		this.sendUpdateMessage.bind(this);
		this.setLastMessage.bind(this);
		this.play.bind(this);
		this.isLoop.bind(this);
		this.isQueueLocked.bind(this);

		this.player.on("stateChange", (state, oldState) => {
			if (this.isQueueLocked()) return;

			if (
				state.status == AudioPlayerStatus.Playing &&
				oldState.status == AudioPlayerStatus.Idle
			) {
				if (this.isLoop()) {
					this.play();
				} else {
					this.recalculateIndexes();

					this.skipSong();

					if (!this.getSongs()[this.getCurrentSongIndex()]) {
						this.sendClearQueueMessage();
						this.destroyQueue();
						return;
					}
				}

				return;
			}
		});
	}

	public getCurrentSongIndex() {
		return this.currentSongIndex;
	}

	private setLock(locked: boolean) {
		this.isLocked = locked;

		return this;
	}

	public generateList() {
		interface DescriptionChunk {
			song: Song;
			text: string;
		}

		const currentSong = this.getCurrentSong();
		const currentSongIndex = currentSong
			? this.getSongs().indexOf(currentSong)
			: -1;

		const chunksList = generateChunks<DescriptionChunk>(
			this.getSongs().map((song, i) => {
				return {
					song: song,
					text: `**#${i + 1} |** [${song.title}](${song.url})${
						i == currentSongIndex ? " **(Tocando Agora)**" : ""
					} | ${song.user}`,
				};
			}),
			10
		);

		const interactionHandshake = randomUUID();

		let currentPage = chunksList.findIndex((chunk: DescriptionChunk[]) =>
			chunk.find((component: DescriptionChunk) =>
				currentSong ? component.song.id == currentSong.id : 0
			)
		);

		const collector = new InteractionCollector(this.voiceChannel.client, {
			time: 60000,
		});

		collector.on("collect", async (button: ButtonInteraction) => {
			if (!button.isButton()) return;

			const targets = button.customId.split(",");
			collector.resetTimer();

			if (targets[0] != interactionHandshake) return;

			const targetPage = Number(targets[2]);

			if (isNaN(targetPage)) return;

			await button.deferUpdate();

			const action = targets[1] as "back" | "none" | "next";

			if (chunksList[targetPage]) {
				currentPage = targetPage;

				const newPage = generatePage(currentPage);

				button.editReply(newPage);
			} else {
				const currentPageContent = generatePage(currentPage);

				button.editReply(currentPageContent);
			}
		});

		function generatePage(page: number) {
			const chunkContent = chunksList[page];

			if (!chunkContent) return { content: "Invalid chunk!" };

			const backPage = new ButtonBuilder()
				.setLabel("◀️")
				.setCustomId(`${interactionHandshake},back,${currentPage - 1}`)
				.setStyle(ButtonStyle.Secondary);
			const pageInfo = new ButtonBuilder()
				.setLabel(`${page + 1} de ${chunksList.length}`)
				.setCustomId(`${interactionHandshake},none`)
				.setStyle(ButtonStyle.Secondary);
			const nextPage = new ButtonBuilder()
				.setLabel("▶️")
				.setCustomId(`${interactionHandshake},next,${currentPage + 1}`)
				.setStyle(ButtonStyle.Secondary);
			const buttons = new ActionRowBuilder<ButtonBuilder>().setComponents(
				backPage,
				pageInfo,
				nextPage
			);

			const embed = new EmbedBuilder()
				.setTitle("📑 List atual de músicas")
				.setDescription(chunkContent.map((c) => c.text).join("\n"))
				.setColor(colors.blue as ColorResolvable);

			return {
				embeds: [embed],
				components: [buttons],
			};
		}

		return generatePage(currentPage);
	}

	public setVoiceChannel(channel: VoiceBasedChannel) {
		this.voiceChannel = channel;
		this.channelId = channel.id;
		this.connection.destroy();
		this.connection = joinVoiceChannel({
			channelId: this.channelId,
			guildId: this.guildId,
			adapterCreator: channel.guild.voiceAdapterCreator,
		});
		this.connection.subscribe(this.player);

		return this;
	}

	private isQueueLocked() {
		return this.isLocked;
	}

	public checkManagePermissionsFor(member: GuildMember) {
		const currentSong = this.getCurrentSong();

		if (!currentSong) return true;

		if (!this.voiceChannel.members.has(currentSong.user.id)) return true;

		if (
			this.voiceChannel.members.size == 2 &&
			this.voiceChannel.members.has(member.id)
		)
			return true;

		if (currentSong.user.id == member.id) return true;

		if (
			currentSong.user.id != member.id &&
			!member.permissions.has("DeafenMembers", true) &&
			!member.permissions.has("MuteMembers", true) &&
			!member.permissions.has("ManageChannels", true)
		)
			return false;

		return true;
	}

	public checkAdminPermissionsFor(member: GuildMember) {
		const currentSong = this.getCurrentSong();

		if (!currentSong) return true;

		if (
			this.voiceChannel.members.size == 2 &&
			this.voiceChannel.members.has(member.id)
		)
			return true;

		if (
			!member.permissions.has("DeafenMembers", true) &&
			!member.permissions.has("MuteMembers", true) &&
			!member.permissions.has("ManageChannels", true)
		)
			return false;

		return true;
	}

	private getSongIndex() {
		return this.currentSongIndex;
	}

	private setSongIndex(index: number) {
		return (this.currentSongIndex = index);
	}

	private isLoop() {
		return this.loop;
	}

	public getPlayingEmbedButtons() {
		const previousSong = new ButtonBuilder()
			.setLabel("⏮️ Anterior")
			.setCustomId(`global,previousSong`)
			.setStyle(ButtonStyle.Secondary);
		const pauseSong = new ButtonBuilder()
			.setLabel("⏯️ Pausar")

			.setCustomId(`global,pauseSong`)
			.setStyle(
				this.player.state.status == AudioPlayerStatus.Paused
					? ButtonStyle.Success
					: ButtonStyle.Secondary
			);
		const loopToggle = new ButtonBuilder()
			.setLabel("🔁 Loop")
			.setCustomId(`global,loopSong`)
			.setStyle(
				this.isLoop() ? ButtonStyle.Success : ButtonStyle.Secondary
			);
		const queueList = new ButtonBuilder()
			.setLabel("📃 Lista")
			.setCustomId(`global,queue`)
			.setStyle(ButtonStyle.Secondary);
		const songTime = new ButtonBuilder()
			.setLabel("🕒 Tempo")
			.setCustomId(`global,time`)
			.setStyle(ButtonStyle.Secondary);
		const downloadAudio = new ButtonBuilder()
			.setLabel("📥 Baixar música")
			.setCustomId(`global,download`)
			.setStyle(ButtonStyle.Secondary);
		const nextSong = new ButtonBuilder()
			.setLabel("⏭️ Próxima")
			.setCustomId(`global,nextSong`)
			.setStyle(ButtonStyle.Secondary);
		const volumeDown = new ButtonBuilder()
			.setLabel("🔉 Volume -")
			.setCustomId(`global,volumeDown`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(this.volume <= 0);
		const volumeUp = new ButtonBuilder()
			.setLabel("🔊 Volume +")
			.setCustomId(`global,volumeUp`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(this.volume >= 10);
		const volumeDisplay = new ButtonBuilder()
			.setLabel(`${this.volume * 10}%`)
			.setCustomId(`global,none`)
			.setStyle(ButtonStyle.Secondary);

		return [
			new ActionRowBuilder<ButtonBuilder>().setComponents(
				previousSong,
				pauseSong,
				loopToggle,
				nextSong
			),
			new ActionRowBuilder<ButtonBuilder>().setComponents(
				volumeDown,
				volumeDisplay,
				volumeUp
			),
			new ActionRowBuilder<ButtonBuilder>().setComponents(
				queueList,
				songTime,
				downloadAudio
			),
		];
	}

	hasNext() {
		return this.getSongIndex() + 1 <= this.getSongs().length;
	}

	hasPrevious() {
		return this.getSongIndex() >= 0;
	}

	addSong(song: Song, ignorePlay?: boolean) {
		this.setSongs(this.getSongs().concat(song));

		if (this.player.state.status == AudioPlayerStatus.Idle && !ignorePlay) {
			this.play();
		}

		this.recalculateIndexes();

		return song;
	}

	destroyQueue() {
		if (this.afkDestroyTimeout) clearTimeout(this.afkDestroyTimeout);
	}

	setTextChannel(textChannel: GuildTextBasedChannel) {
		this.textChannel = textChannel;

		return this;
	}

	selectSong(index: number) {
		this.setSongIndex(index);

		const currentSong = this.getCurrentSong();

		if (!currentSong) return;

		const currentSongAudio = currentSong.getAudio();

		if (currentSong.volume != this.volume && currentSongAudio.volume) {
			currentSong.setStaticVolume(this.volume);
			currentSongAudio.volume.setVolume(this.volume);
		}

		this.sendUpdateMessage();

		this.player.play(currentSong.getAudio());
	}

	setVolume(volume: number) {
		if (volume < 0 || volume > 1) return;

		this.volume = volume;
		this.executeVolumeChange();

		return this.volume;
	}

	private executeVolumeChange() {
		if (this.player.checkPlayable()) {
			(
				this.player.state as AudioPlayerPlayingState
			).resource.volume?.setVolume(this.volumeIndexes[this.volume]);
		}
	}

	volumeUp() {
		if (this.volume == 10) return;

		this.volume += 1;
		this.executeVolumeChange();

		return this.volume;
	}

	volumeDown() {
		if (this.volume == 0) return;

		this.volume -= 1;
		this.executeVolumeChange();

		return this.volume;
	}

	getCurrentSong(): Song | undefined {
		return this.getSongs()[this.getCurrentSongIndex()];
	}

	findCurrentSongIndex() {
		const currentSong = this.getCurrentSong();

		if (!currentSong) return -1;

		return this.getSongs().findIndex((c) => c.id == currentSong.id);
	}

	findSongIndexById(songId: string) {
		return this.getSongs().findIndex((c) => c.id == songId);
	}

	public sendUpdateMessage() {
		try {
			if (this.lastStatusMessage)
				this.lastStatusMessage.delete().catch(() => {
					void {};
				});

			this.setLastMessage.bind(this);

			this.textChannel
				.send(this.generateQueueMessage())
				.then((message) => this.setLastMessage(message))
				.catch(() => void {});
		} catch (e) {
			console.log(e);
		}
	}

	public editUpdateMessage() {
		try {
			if (
				this.lastStatusMessage &&
				this.player.state.status != AudioPlayerStatus.Paused
			)
				this.lastStatusMessage
					.edit(this.generateQueueMessage())
					.catch(() => {
						void {};
					});
		} catch (e) {
			console.log(e);
		}
	}

	public sendClearQueueMessage() {
		try {
			if (this.isQueueLocked()) return;

			if (this.lastStatusMessage)
				this.lastStatusMessage.delete().catch(() => {
					void {};
				});

			this.textChannel
				.send(this.generateClearQueueMessage())
				.catch(() => void {});
		} catch (e) {
			console.log(e);
		}
	}

	private setLastMessage(message: Message) {
		this.lastStatusMessage = message;

		return this;
	}

	private generateClearQueueMessage() {
		const embed = new EmbedBuilder()
			.setAuthor({
				name: "🎵 A lista ta limpa...",
			})
			.setColor(colors.blue as ColorResolvable);

		return {
			embeds: [embed],
		};
	}

	public clearQueue() {
		this.player.stop();
		this.setSongs([] as Song[]);
		this.setSongIndex(0);
		this.lastStatusMessage = null;

		return this;
	}

	public pause() {
		if (this.player.state.status == AudioPlayerStatus.Paused)
			return this.player.unpause();
		this.player.pause();
	}

	public generateQueueMessage() {
		const currentSong = this.getCurrentSong();

		const embed = new EmbedBuilder()
			.setAuthor({
				name: "🎵 Tocando agora",
			})
			.setTitle(`${currentSong?.title}`)
			.setURL(`${currentSong?.url}`)
			.setThumbnail(`${currentSong?.thumbnail}`)
			.setDescription(
				`👤 Adicionado por: <@${currentSong?.user.id}> | \n${timeString(
					this.player.state.status == AudioPlayerStatus.Playing
						? (this.player.state.resource?.playbackDuration ||
								1000) / 1000
						: 0
				)}/${timeString(
					currentSong?.duration || 0
				)} ${this.generateStaticSeekBar()}`
			)
			.setColor(colors.blue as ColorResolvable);

		return {
			embeds: [embed],
			components: this.getPlayingEmbedButtons(),
		};
	}

	private generateStaticSeekBar() {
		const playerState = this.player.state as AudioPlayerPlayingState;
		const currentPosition = playerState.playbackDuration / 1000;
		const currentPositionPercentage = percentageOfTotal(
			currentPosition,
			this.getCurrentSong()?.duration || 0
		);
		const maxBars = 15;

		const barsCount = Math.round(
			percentageOf(Math.round(currentPositionPercentage), maxBars)
		);

		return `${generateTextProgressBar(barsCount, maxBars)}`;
	}

	setLoop(loop: boolean) {
		this.loop = loop;

		return this;
	}

	public getSongs() {
		return this.songs;
	}

	private setSongs(songs: Song[]) {
		return (this.songs = songs);
	}

	private recalculateIndexes() {
		const currentSong = this.getCurrentSong();

		if (!currentSong) return this.setSongIndex(0);

		const currentSongIndex = this.songs.findIndex(
			(s) => s.id == currentSong.id
		);

		this.setSongIndex(currentSongIndex);
	}

	public getSongById(id: string) {
		return this.songs.find((s) => s.id == id);
	}

	public removeSong(songId: string) {
		const targetSongIndex = this.findSongIndexById(songId);

		const songs = this.getSongs();
		songs.splice(targetSongIndex, 1);

		this.setSongs(songs);
		this.recalculateIndexes();

		const recalculatedSongIndex = this.findSongIndexById(songId);

		if (recalculatedSongIndex == this.findCurrentSongIndex()) {
			if (this.getSongIndex() + 1 >= this.getSongs().length)
				return SongRemoveStatus.Destroyed;

			if (this.findCurrentSongIndex() + 1 < this.getSongs().length)
				return SongRemoveStatus.Skip;

			return SongRemoveStatus.None;
		}

		if (recalculatedSongIndex != this.findCurrentSongIndex())
			return SongRemoveStatus.None;

		if (recalculatedSongIndex + 1 >= this.getSongs().length)
			return SongRemoveStatus.Destroyed;

		if (recalculatedSongIndex + 1 < this.getSongs().length)
			return SongRemoveStatus.Skip;

		return SongRemoveStatus.None;
	}

	skipSong() {
		if (this.getSongIndex() + 1 >= this.getSongs().length) {
			this.setSongIndex(this.getSongIndex() + 1);

			this.player.stop();

			return;
		}

		this.setSongIndex(this.getSongIndex() + 1);

		this.selectSong(this.getSongIndex());
	}

	previousSong() {
		if (this.getSongIndex() - 1 < 0) return;

		this.setSongIndex(this.getSongIndex() - 1);

		this.selectSong(this.getSongIndex());
	}

	play() {
		this.selectSong(this.getSongIndex());
	}
}
