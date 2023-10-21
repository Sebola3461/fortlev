import { GuildMember } from "discord.js";
import { djosu } from "..";
import { SlashCommand } from "../struct/commands/SlashCommand";
import { errorEmbed } from "../utils/embeds/errorEmbed";
import { infoEmbed } from "../utils/embeds/infoEmbed";

export default new SlashCommand()
	.setName("desconectar")
	.setDescription("Finaliza o batidao")
	.setExecutable(async (command) => {
		if (!command.guildId || !command.member) return;

		const queue = djosu.queues.getQueue(command.guildId);

		if (!queue)
			return errorEmbed(command.editReply.bind(command), {
				description: "N tem nd tocando o filho da puta",
			});

		if (!queue.checkAdminPermissionsFor(command.member as GuildMember))
			return errorEmbed(command.editReply.bind(command), {
				description: "Não, plebeu. Vc n tem permissão",
			});

		command.deleteReply();

		queue.clearQueue();
		queue.connection.destroy();
		djosu.queues.destroy(command.guildId);

		infoEmbed(command.editReply.bind(command), {
			title: "✅ Deu certo",
			description: "Limpei todas as musica dessa porra",
		});
	});
