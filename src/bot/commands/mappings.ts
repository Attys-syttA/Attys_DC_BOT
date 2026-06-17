import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { Project } from "../../db/types.js";
import { getAllProjects } from "../../db/database.js";
import { L } from "../../utils/i18n.js";

interface MappingGroup {
  projectPath: string;
  projects: Project[];
}

function groupProjects(projects: Project[]): MappingGroup[] {
  const groups = new Map<string, Project[]>();
  for (const project of projects) {
    const existing = groups.get(project.project_path) ?? [];
    existing.push(project);
    groups.set(project.project_path, existing);
  }

  return [...groups.entries()]
    .map(([projectPath, groupedProjects]) => ({
      projectPath,
      projects: groupedProjects.sort((a, b) => a.channel_id.localeCompare(b.channel_id)),
    }))
    .sort((a, b) => {
      const duplicateDelta = Number(b.projects.length > 1) - Number(a.projects.length > 1);
      if (duplicateDelta !== 0) return duplicateDelta;
      return a.projectPath.localeCompare(b.projectPath);
    });
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

export function renderMappingFields(projects: Project[]) {
  let duplicateIndex = 0;
  return groupProjects(projects).slice(0, 25).map((group) => {
    const duplicate = group.projects.length > 1;
    const channels = group.projects
      .map((project) => {
        const prefix = duplicate ? `${++duplicateIndex}. ` : "";
        return `${prefix}<#${project.channel_id}>${project.auto_approve ? " auto-approve" : ""}`;
      })
      .join("\n");

    return {
      name: `${duplicate ? "DUPLICATE" : "OK"} ${truncate(group.projectPath, 180)}`,
      value: [
        `${L("Channels", "채널")}: ${group.projects.length}`,
        channels,
        duplicate
          ? L("Cleanup: use `/unregister channel:` for old forum/thread mappings.", "정리: 오래된 매핑은 `/unregister channel:`로 제거하세요.")
          : L("Single mapping.", "단일 매핑입니다."),
      ].join("\n"),
      inline: false,
    };
  });
}

export function renderMappingComponents(projects: Project[]) {
  let duplicateIndex = 0;
  const buttons: ButtonBuilder[] = [];
  for (const group of groupProjects(projects)) {
    if (group.projects.length <= 1) continue;
    for (const project of group.projects) {
      duplicateIndex += 1;
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`mapping-remove:${project.channel_id}`)
          .setLabel(`Remove ${duplicateIndex}`)
          .setStyle(ButtonStyle.Danger),
      );
      if (buttons.length >= 20) break;
    }
    if (buttons.length >= 20) break;
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(i, i + 5)));
  }
  return rows;
}

export function renderMappingsPayload(projects: Project[]) {
  const duplicateGroups = groupProjects(projects).filter((group) => group.projects.length > 1).length;
  const embed = new EmbedBuilder()
    .setTitle(L("Project Channel Mappings", "프로젝트 채널 매핑"))
    .setDescription([
      `${L("Mappings", "매핑")}: **${projects.length}**`,
      `${L("Duplicate project paths", "중복 프로젝트 경로")}: **${duplicateGroups}**`,
      duplicateGroups > 0
        ? L("Use the Remove buttons or `/unregister channel:` for old forum/thread mappings.", "오래된 포럼/스레드 매핑은 Remove 버튼 또는 `/unregister channel:`로 제거할 수 있습니다.")
        : L("No duplicate project mappings found.", "중복 프로젝트 매핑이 없습니다."),
    ].join("\n"))
    .setColor(duplicateGroups > 0 ? 0xf59e0b : 0x10b981)
    .setTimestamp()
    .addFields(renderMappingFields(projects));

  return {
    embeds: [embed],
    components: renderMappingComponents(projects),
  };
}

export const data = new SlashCommandBuilder()
  .setName("mappings")
  .setDescription("List project-channel mappings and flag duplicates");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId!;
  const projects = getAllProjects(guildId);

  if (projects.length === 0) {
    await interaction.editReply({
      content: L("No project-channel mappings registered. Use `/register` first.", "등록된 프로젝트-채널 매핑이 없습니다. 먼저 `/register`를 사용하세요."),
    });
    return;
  }

  await interaction.editReply(renderMappingsPayload(projects));
}
