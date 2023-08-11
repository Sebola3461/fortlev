import { GuildMember, SlashCommandStringOption } from "discord.js";
import { djosu } from "..";
import { SlashCommand } from "../struct/commands/SlashCommand";
import { errorEmbed } from "../utils/embeds/errorEmbed";

export default new SlashCommand()
	.setName("skip")
	.setDescription("Pula pra uma musica específica")
	.addOptions(
		new SlashCommandStringOption()
			.setName("posicao")
			.setDescription("Seleciona uma musica ae")
			.setAutocomplete(true)
			.setRequired(true)
	)
	.setExecutable(async (command) => {
		if (!command.guildId || !command.member) return;

		const position = Number(
			command.options.getString("posicao", true).split(",")[1]
		);

		const queue = djosu.queues.getQueue(command.guildId);

		if (!queue)
			return errorEmbed(command.editReply.bind(command), {
				description: "Tem nada tocando nessa porra burro",
			});

		const voiceChannel = (command.member as GuildMember).voice.channel;

		if (!voiceChannel)
			return errorEmbed(command.editReply.bind(command), {
				description:
					"Cara tu é idiota ou se faz? Entra na call caralho",
			});

		if (
			queue &&
			queue.channelId != voiceChannel.id &&
			!queue.checkAdminPermissionsFor(command.member as GuildMember)
		)
			return errorEmbed(command.editReply.bind(command), {
				description: `To tocando música em outra call (<#${queue.channelId}>) quero mais é q tu se foda`,
			});

		if (!queue.checkManagePermissionsFor(command.member as GuildMember))
			return errorEmbed(command.editReply.bind(command), {
				description: "nao",
			});

		command.deleteReply();

		if (queue.getSongs()[position]) {
			queue.selectSong(position);
			queue.sendUpdateMessage();
		}
	});
