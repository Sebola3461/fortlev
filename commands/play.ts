import {
	ColorResolvable,
	EmbedBuilder,
	GuildMember,
	SlashCommandStringOption,
	TextChannel,
} from "discord.js";
import { playlistInfo, videoInfo } from "youtube-ext";
import { getVideoMP3Binary } from "yt-get";

import { djosu } from "..";
import { SlashCommand } from "../struct/commands/SlashCommand";
import { Song } from "../struct/core/Song";
import { clientHasValidVoicePermissions } from "../utils/checkers/clientHasValidVoicePermissions";
import { errorEmbed } from "../utils/embeds/errorEmbed";
import timeString from "../utils/transformers/timeString";
import { colors } from "../constants/colors";
import { LoggerService } from "../struct/general/LoggerService";
import { YouTubeDownloader } from "../struct/youtube/YouTubeDownloader";
import { readFileSync } from "fs";
import path from "path";
import { AudioPlayerStatus } from "@discordjs/voice";

export default new SlashCommand()
	.setName("play")
	.setDescription("Toca uma musica ou playlist")
	.addOptions(
		new SlashCommandStringOption()
			.setName("link_ou_nome")
			.setDescription("Link ou o nome da musica pra pesquisar")
			.setAutocomplete(true)
			.setRequired(true)
	)
	.setExecutable(async (command) => {
		try {
			if (!command.member) return;

			const Logger = new LoggerService(
				`Play Command: ${command.guildId}`
			);

			const musica = command.options.getString("link_ou_nome", true);

			const canalAtual = (command.member as GuildMember).voice.channel;

			if (!musica)
				return errorEmbed(command.editReply.bind(command), {
					description:
						"Essa ai q tu escolheu ta bugada, escolhe outra ai",
				});

			if (!canalAtual)
				return errorEmbed(command.editReply.bind(command), {
					description:
						"Tu é burro ou se faz? Tem q entrar na call burrão",
				});

			const url = new URL(musica);

			if (!clientHasValidVoicePermissions(canalAtual))
				return errorEmbed(command.editReply.bind(command), {
					description:
						"Fi da pra toca musica nessa call não, n consigo entrar nessa porra",
				});

			const videoId = url.href;
			const playlist = url.searchParams.get("list");
			const playlistIndex = url.searchParams.get("index");

			let guildQueue = djosu.queues.getQueue(command.guildId as string);

			if (!guildQueue) {
				guildQueue = djosu.queues.createQueue(canalAtual);
				guildQueue.setVoiceChannel(canalAtual);
				guildQueue.setTextChannel(command.channel as TextChannel);
			}

			const downloader = new YouTubeDownloader();

			if (playlist) return queuePlaylist(playlist, playlistIndex);
			if (!playlist) return queueVideo(videoId);

			async function queueVideo(videoId: string) {
				const mp3 = await downloader.getMP3(videoId);
				const mp3Info = await videoInfo(videoId);

				const queue = djosu.queues.getQueue(command.guildId as string);

				if (!queue)
					return errorEmbed(command.editReply.bind(command), {
						description: "Lista inválida!",
					});

				queue.addSong(
					new Song(
						mp3Info.title,
						mp3Info ? mp3Info.url : url.href,
						mp3Info ? mp3Info.thumbnails[0].url : "",
						command.user,
						mp3,
						Number(mp3Info.duration.lengthSec)
					)
				);

				if (queue.getSongs().length != 1) {
					const addedEmbed = new EmbedBuilder()
						.setAuthor({ name: "✅ Adicionado" })
						.setDescription(
							`Adicionado à lista na posição \`${
								queue.getSongs().length
							}\` (Atualmente tocando \`${
								queue.getCurrentSongIndex() + 1
							}\`)`
						)
						.setTitle(mp3Info.title)
						.setURL(mp3Info.url)
						.setThumbnail(mp3Info.thumbnails[0].url)
						.addFields({
							name: "🕒 Duração",
							value: timeString(
								Number(mp3Info.duration.lengthSec)
							),
							inline: true,
						})
						.addFields({
							name: "👤 Canal",
							value: mp3Info.channel.name,
							inline: true,
						})
						.setColor(colors.green as ColorResolvable);

					command.editReply({
						embeds: [addedEmbed],
					});
				} else {
					command.deleteReply();
				}
			}

			async function queuePlaylist(
				listId: string,
				index?: string | null
			) {
				let withError = 0;
				const stagingQueue: { id: string; song: Song }[] = [];

				try {
					const queue = djosu.queues.getQueue(
						command.guildId as string
					);

					if (!queue)
						return errorEmbed(command.editReply.bind(command), {
							description: "Lista inválida!",
						});

					if (index) {
						if (isNaN(Number(index))) index = "0";
					}

					const playlistContent = await playlistInfo(listId);

					for (const video of playlistContent.videos) {
						try {
							const videoData = await downloader.getMP3(video.id);

							if (videoData) {
								stagingQueue.push({
									id: video.id,
									song: new Song(
										video.title,
										video.url,
										video.thumbnails[1].url,
										command.user,
										videoData,
										Number(video.duration.lengthSec)
									),
								});

								Logger.printSuccess(
									`Staged song ${video.title}`
								);
							} else {
								Logger.printError(
									`Invalid response: ${video.id}`
								);
							}
						} catch (e) {
							withError++;

							Logger.printError(`Can't stage song a song!`);

							console.log(e);
						}
					}

					let stagedQueue: Song[] = [];

					for (const song of stagingQueue) {
						const index = playlistContent.videos.findIndex(
							(video) => video.id == song.id
						);

						stagedQueue[index] = song.song;
					}

					let playlistDuration = 0;

					for (let i = 0; i < stagedQueue.length; i++) {
						if (!stagedQueue[i]) {
							delete stagedQueue[i];
						}

						stagedQueue = stagedQueue.filter((song) => {
							if (song) return song;
						});
					}

					for (const song of stagedQueue) {
						playlistDuration += song.duration;

						queue.addSong(song, true);
					}

					if (index) {
						if (
							Number(index) <= queue.getSongs().length - 1 &&
							Number(index) > -1
						) {
							queue.selectSong(Number(index) - 1);
						}
					}

					if (
						queue.player.state.status != AudioPlayerStatus.Playing
					) {
						queue.play();
					}

					const addedEmbed = new EmbedBuilder()
						.setAuthor({ name: "✅ Adicionado" })
						.setDescription(
							`Adicionado ${
								stagingQueue.length
							} músicas à lista. ${
								withError > 1
									? `${withError} musica(s) foram ignoradas por erros.`
									: ""
							}`
						)
						.setTitle(playlistContent.title)
						.setURL(playlistContent.url)
						.setThumbnail(playlistContent.thumbnails[0].url)
						.addFields({
							name: "🕒 Duração",
							value: timeString(Number(playlistDuration)),
							inline: true,
						})
						.setColor(colors.green as ColorResolvable);

					command.editReply({
						embeds: [addedEmbed],
					});
				} catch (e) {
					console.error(e);

					if (withError > 0 && stagingQueue.length < 1) {
						errorEmbed(command.editReply.bind(command), {
							description:
								"Não foi possível adicionar as músicas da playlist",
						});
					}

					if (withError > 0 && stagingQueue.length > 0) {
						errorEmbed(command.editReply.bind(command), {
							description: `\`${withError}\` música(s) foram ignoradas pois não foi possível fazer o download. O restante das músicas irão tocar normalmente`,
						});
					}
				}
			}
		} catch (e: any) {
			console.error(e);

			errorEmbed(command.editReply.bind(command), {
				title: "Ou tu fez merda ou bugo msm",
				description:
					e.code == "ERR_INVALID_URL"
						? "Vc não selecionou a música, só colocou o título! Antes de enviar o comando, escolhe uma música da lista"
						: e.message || "Deu ruim, pinga o macaco ai",
			});
		}
	});
