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

			if (playlist) return queuePlaylist(playlist, playlistIndex);
			if (!playlist) return queueVideo(videoId);

			async function queueVideo(videoId: string) {
				const mp3 = await getVideoMP3Binary(videoId);
				const mp3Info = await videoInfo(videoId);

				const queue = djosu.queues.getQueue(command.guildId as string);

				if (!queue)
					return errorEmbed(command.editReply.bind(command), {
						description: "Lista inválida!",
					});

				queue.addSong(
					new Song(
						mp3.title,
						mp3Info.url,
						mp3Info.thumbnails[0].url,
						command.user,
						mp3.mp3,
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
						.setTitle(mp3.title)
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
					let withError = 0;

					const stagingQueue: { id: string; song: Song }[] = [];

					for (const video of playlistContent.videos) {
						try {
							const videoData = await getVideoMP3Binary(
								video.url
							);

							if (videoData) {
								stagingQueue.push({
									id: video.id,
									song: new Song(
										videoData.title,
										video.url,
										video.thumbnails[1].url,
										command.user,
										videoData.mp3,
										Number(video.duration.lengthSec)
									),
								});
							} else {
								withError++;
							}
						} catch (e) {
							console.log(e);
						}
					}

					const stagedQueue: Song[] = [];

					for (const song of stagingQueue) {
						const index = playlistContent.videos.findIndex(
							(video) => video.id == song.id
						);

						stagedQueue[index] = song.song;
					}

					let playlistDuration = 0;

					for (const song of stagedQueue) {
						playlistDuration += song.duration;

						queue.addSong(song);
					}

					if (index) {
						if (
							Number(index) <= queue.getSongs().length - 1 &&
							Number(index) > -1
						) {
							queue.selectSong(Number(index) - 1);
						}
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
					errorEmbed(command.editReply.bind(command), {
						description:
							"Não foi possível adicionar as músicas da playlist",
					});
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
