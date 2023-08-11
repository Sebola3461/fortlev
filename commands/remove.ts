import {
	ColorResolvable,
	EmbedBuilder,
	GuildMember,
	SlashCommandIntegerOption,
} from "discord.js";
import { djosu } from "..";
import { SlashCommand } from "../struct/commands/SlashCommand";
import { errorEmbed } from "../utils/embeds/errorEmbed";
import { SongRemoveStatus } from "../struct/core/MusicQueue";
import { colors } from "../constants/colors";

export default new SlashCommand()
	.setName("remove")
	.setDescription("Remove a song from the queue")
	.addOptions(
		new SlashCommandIntegerOption()
			.setName("index")
			.setDescription("Non-zero index of the song")
			.setRequired(true)
	)
	.setExecutable(async (command) => {
		if (!command.guildId || !command.member) return;

		const queue = djosu.queues.getQueue(command.guildId);

		if (!queue)
			return errorEmbed(command.editReply.bind(command), {
				description: "There's nothing playing here!",
			});

		const voiceChannel = (command.member as GuildMember).voice.channel;

		if (!voiceChannel)
			return errorEmbed(command.editReply.bind(command), {
				description: "You need to join a voice channel!",
			});

		if (
			queue &&
			queue.channelId != voiceChannel.id &&
			!queue.checkAdminPermissionsFor(command.member as GuildMember)
		)
			return errorEmbed(command.editReply.bind(command), {
				description: `I'm playing song in another channel! Please, join <#${queue.channelId}> and try again.`,
			});

		if (!queue.checkManagePermissionsFor(command.member as GuildMember))
			return errorEmbed(command.editReply.bind(command), {
				description: "You don't have permissions to do it.",
			});

		const index = command.options.getInteger("index", true) - 1;

		const targetSong = queue.getSongs()[index];

		if (!targetSong) return;

		const removeStatus = queue.removeSong(targetSong.id);

		if (removeStatus == SongRemoveStatus.Skip) {
			command.deleteReply();
			console.log("skip from remove");
			return queue.skipSong();
		}

		if (removeStatus == SongRemoveStatus.Destroyed) {
			command.deleteReply();
			return queue.destroyQueue();
		}

		if (removeStatus == SongRemoveStatus.None) {
			const embed = new EmbedBuilder()
				.setAuthor({
					name: "✅ Song Removed",
				})
				.setTitle(`${targetSong.title}`)
				.setURL(`${targetSong.url}`)
				.setThumbnail(`${targetSong.thumbnail}`)
				.setColor(colors.green as ColorResolvable);

			command.editReply({
				embeds: [embed],
			});
		}
	});
