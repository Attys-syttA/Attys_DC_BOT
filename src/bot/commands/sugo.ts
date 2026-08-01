import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { commandAutocompleteChoices, renderHelpDetail, renderHelpList } from "./help-renderer.js";

export const data = new SlashCommandBuilder()
  .setName("sugo")
  .setDescription("Magyar sugo a bot parancsaihoz")
  .addStringOption((opt) =>
    opt
      .setName("parancs")
      .setDescription("Melyik parancsrol kersz reszletesebb sugot?")
      .setRequired(false)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await interaction.respond(commandAutocompleteChoices(interaction.options.getFocused()));
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const selected = interaction.options.getString("parancs", false);
  await interaction.editReply({
    content: selected ? renderHelpDetail(selected) : renderHelpList(interaction.commandName),
  });
}
