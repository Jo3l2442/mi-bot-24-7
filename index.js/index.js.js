const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

// --- VERIFICACIÓN DE VARIABLES DE ENTORNO ---
if (!process.env.TOKEN) {
  console.error("❌ Error: Falta el token del bot en los Secrets (TOKEN).");
  process.exit(1);
}

// --- CONSTANTES DE CONFIGURACIÓN ---
const LOG_CHANNEL_ID = "1464127818882482414";

// --- CONFIGURACIÓN DE DIVISIONES (Crew Blox Fruits) ---
const DIVISION_CONFIG = {
  CANAL_DIVISIONES_ID: "1464127820081926211",
  CAPITAN_ROLE_ID: "1464127818429628595",
  VICE_ROLE_ID: "1464127818429628594",
  TERCER_CAPITAN_ROLE_ID: "1464127818429628593", // ID Proporcionado por el sistema/simulado
  DIV1_CAP_ROLE_ID: "1464127818417049616",
  DIV1_VICE_ROLE_ID: "1464127818417049615",
  DIV1_ROLE_ID: "1464127818404462729",
  DIV2_CAP_ROLE_ID: "1464127818417049614",
  DIV2_VICE_ROLE_ID: "1464127818417049613",
  DIV2_ROLE_ID: "1464127818404462728",
  DIV3_CAP_ROLE_ID: "1464127818417049612",
  DIV3_VICE_ROLE_ID: "1464127818417049611",
  DIV3_ROLE_ID: "1464127818404462727",
  DIV4_CAP_ROLE_ID: "1464127818404462736",
  DIV4_VICE_ROLE_ID: "1464127818404462735",
  DIV4_ROLE_ID: "1464127818400010251"
};

const DURATION_UNITS = {
  dias: 24 * 60 * 60 * 1000,
  horas: 60 * 60 * 1000,
  minutos: 60 * 1000
};

// --- DEFINICIÓN DE COMANDOS ---
const commands = [
  new SlashCommandBuilder()
    .setName("cuarentena")
    .setDescription("Pone a un usuario en cuarentena temporalmente.")
    .addUserOption(option => option.setName("usuario").setDescription("El usuario a aislar").setRequired(true))
    .addIntegerOption(option => option.setName("dias").setDescription("Duración en días (opcional)").setMinValue(0))
    .addIntegerOption(option => option.setName("horas").setDescription("Duración en horas (opcional)").setMinValue(0).setMaxValue(23))
    .addIntegerOption(option => option.setName("minutos").setDescription("Duración en minutos (opcional)").setMinValue(0).setMaxValue(59))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("liberar")
    .setDescription("Libera a un usuario de la cuarentena manualmente.")
    .addUserOption(option => option.setName("usuario").setDescription("El usuario a liberar").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("setcuarentena")
    .setDescription("Configura el rol de cuarentena.")
    .addRoleOption(option => option.setName("rol").setDescription("El rol de cuarentena").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("settiempo")
    .setDescription("Configura el tiempo por defecto de la cuarentena.")
    .addIntegerOption(option => option.setName("minutos").setDescription("Tiempo en minutos").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("setcanal")
    .setDescription("Configura el canal permitido (solo informativo).")
    .addChannelOption(option => option.setName("canal").setDescription("El canal permitido").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("reconstruir")
    .setDescription("Fuerza el escaneo total y reconstruye los embeds de divisiones.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Añade un aviso a un usuario.")
    .addUserOption(option => option.setName("usuario").setDescription("Usuario a avisar").setRequired(true))
    .addStringOption(option => option.setName("razon").setDescription("Razón del aviso").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("warns")
    .setDescription("Muestra los avisos de un usuario.")
    .addUserOption(option => option.setName("usuario").setDescription("Usuario a consultar").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("Elimina todos los avisos de un usuario.")
    .addUserOption(option => option.setName("usuario").setDescription("Usuario a limpiar").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
];

// --- CLIENTE DE DISCORD ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

const quarantineMap = new Map();
const CONFIG_FILE = "./discord-bot/config.json";
const ROLES_FILE = "./discord-bot/roles.json";
const WARNS_FILE = "./discord-bot/warns.json";

function loadWarns() {
  try { return JSON.parse(fs.readFileSync(WARNS_FILE, "utf8")); }
  catch (e) { return {}; }
}
function saveWarns(warns) { fs.writeFileSync(WARNS_FILE, JSON.stringify(warns, null, 2)); }

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch (e) { return { quarantineRole: null, defaultTime: 30, logChannel: null }; }
}
function saveConfig(config) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }
function loadRoles() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ROLES_FILE, "utf8"));
    for (const [userId, data] of Object.entries(parsed)) {
      quarantineMap.set(userId, { roles: data.roles || [], expiresAt: data.expiresAt || 0, guildId: data.guildId });
    }
    return parsed;
  } catch (e) { return {}; }
}
function saveRoles(roles) { fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2)); }
function isUserInQuarantine(userId) { return quarantineMap.has(userId); }

function calcularDuracion(dias = 0, horas = 0, minutos = 0) {
  const defaultMinutos = 30;
  const totalMs = (dias * DURATION_UNITS.dias) + (horas * DURATION_UNITS.horas) + (minutos * DURATION_UNITS.minutos);
  return totalMs > 0 ? totalMs : defaultMinutos * DURATION_UNITS.minutos;
}

function formatearDuracion(ms) {
  const dias = Math.floor(ms / DURATION_UNITS.dias);
  const horas = Math.floor((ms % DURATION_UNITS.dias) / DURATION_UNITS.horas);
  const mins = Math.floor((ms % DURATION_UNITS.horas) / DURATION_UNITS.minutos);
  const partes = [];
  if (dias > 0) partes.push(`${dias} día${dias !== 1 ? 's' : ''}`);
  if (horas > 0) partes.push(`${horas} hora${horas !== 1 ? 's' : ''}`);
  if (mins > 0) partes.push(`${mins} minuto${mins !== 1 ? 's' : ''}`);
  return partes.length > 0 ? partes.join(', ') : 'por defecto';
}

async function enviarLog(guild, tipo, usuario, moderador, duracion, razon = '', userObject = null) {
  const config = loadConfig();
  const logChannelId = config.logChannel || LOG_CHANNEL_ID;
  if (!logChannelId) return;
  try {
    const channel = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    let titulo = '', color = 0x0, accion = '';
    if (tipo === 'CUARENTENA') { titulo = '🔒 Cuarentena Aplicada'; color = 0xFFC107; accion = 'Usuario puesto en cuarentena'; }
    else if (tipo === 'LIBERADO_AUTO') { titulo = '🔓 Cuarentena Expirada'; color = 0x4CAF50; accion = 'Liberado automáticamente'; }
    else if (tipo === 'LIBERADO_MANUAL') { titulo = '🔓 Usuario Liberado'; color = 0x4CAF50; accion = 'Liberado manualmente'; }
    const embed = new EmbedBuilder().setColor(color).setTitle(titulo).setThumbnail(userObject?.displayAvatarURL({ dynamic: true }) || null)
      .addFields(
        { name: '🛡️ Moderador', value: moderador ? (moderador.id ? `<@${moderador.id}>` : moderador) : 'Sistema', inline: true },
        { name: '👤 Usuario', value: userObject?.id ? `<@${userObject.id}>` : usuario, inline: true },
        { name: '📝 Acción', value: accion, inline: false },
        { name: '⏱️ Duración', value: duracion, inline: true },
        { name: '📍 Canal', value: guild.name, inline: true }
      )
      .setFooter({ text: `${guild.name} • Moderación` }).setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {}
}

client.once("clientReady", async () => {
  console.log(`🤖 Bot conectado como ${client.user.tag}`);
  loadRoles();
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ Comandos registrados globalmente.");
    client.guilds.cache.forEach(guild => reconstruirDivisiones(guild));
  } catch (error) { console.error("❌ Error Comandos:", error.message); }
  setInterval(async () => {
    const now = Date.now();
    for (const [userId, data] of quarantineMap.entries()) {
      if (data.expiresAt && now > data.expiresAt) {
        for (const guild of client.guilds.cache.values()) {
          if (data.guildId && guild.id !== data.guildId) continue;
          try {
            const member = await guild.members.fetch(userId);
            if (member) {
              const savedRoles = loadRoles();
              await liberarUsuario(member, guild, data, savedRoles, userId, true, member.user);
              saveRoles(savedRoles);

              // LOG AUTOMÁTICO DE LIBERACIÓN
              const config = loadConfig();
              const logChId = config.logChannel || LOG_CHANNEL_ID;
              const channel = await guild.channels.fetch(logChId).catch(() => null);
              if (channel?.isTextBased()) {
                const embed = new EmbedBuilder()
                  .setTitle("🔓 Cuarentena Expirada")
                  .setColor(0x4CAF50)
                  .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                  .addFields(
                    { name: "👤 Usuario", value: `<@${member.id}>`, inline: true },
                    { name: "🛡️ Moderador", value: `<@${client.user.id}>`, inline: true },
                    { name: "📝 Acción", value: "Liberado automáticamente", inline: false }
                  )
                  .setFooter({ text: `${guild.name} • Moderación` })
                  .setTimestamp();
                await channel.send({ content: `🔔 **Registro de Cuarentena:** <@${member.id}> | <@${client.user.id}>`, embeds: [embed] }).catch(() => {});
              }
            }
          } catch (err) {}
        }
      }
    }
  }, 30000);
});

async function liberarUsuario(member, guild, data, rolesDb, userId, esAutomatico = false, userObject = null) {
  const config = loadConfig();
  const qRole = config.quarantineRole;
  if (qRole && member.roles.cache.has(qRole)) await member.roles.remove(qRole).catch(() => {});
  if (data.roles?.length > 0) {
    const toAdd = data.roles.map(id => guild.roles.cache.get(id)).filter(r => r && r.editable && r.id !== guild.id);
    if (toAdd.length > 0) await member.roles.add(toAdd).catch(() => {});
  }
  quarantineMap.delete(userId);
  delete rolesDb[userId];
}

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  
  // Defer response immediately to avoid 3s timeout and error 10062
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    console.error("Error deferring reply:", err);
    return;
  }
  
  const config = loadConfig();
  const savedRoles = loadRoles();
  try {
    if (commandName === "setcuarentena") {
      const role = interaction.options.getRole("rol");
      config.quarantineRole = role.id;
      saveConfig(config);
      await interaction.editReply({ content: `✅ Rol configurado: ${role}` });
    } else if (commandName === "settiempo") {
      const mins = interaction.options.getInteger("minutos");
      config.defaultTime = mins;
      saveConfig(config);
      await interaction.editReply({ content: `✅ Tiempo: ${mins}m` });
    } else if (commandName === "setcanal") {
      const ch = interaction.options.getChannel("canal");
      config.logChannel = ch.id;
      saveConfig(config);
      await interaction.editReply({ content: `✅ Canal: ${ch}` });
    } else if (commandName === "cuarentena") {
      const member = interaction.options.getMember("usuario");
      if (!member) return interaction.editReply({ content: "❌ No se pudo encontrar al miembro." });

      // Validaciones de seguridad
      if (interaction.user.id === member.id) return interaction.editReply({ content: "No puedes usar este comando sobre ti mismo." });
      if (member.id === interaction.guild.ownerId) return interaction.editReply({ content: "No puedes moderar al dueño del servidor." });
      if (interaction.member.roles.highest.position <= member.roles.highest.position) return interaction.editReply({ content: "No puedes moderar a un usuario con un rol igual o superior al tuyo." });
      if (interaction.guild.members.me.roles.highest.position <= member.roles.highest.position) return interaction.editReply({ content: "Mi rol es demasiado bajo para moderar a este usuario." });

      if (isUserInQuarantine(member.id)) return interaction.editReply("❌ Error");
      const ms = calcularDuracion(interaction.options.getInteger("dias"), interaction.options.getInteger("horas"), interaction.options.getInteger("minutos"));
      const rToS = member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.id);
      quarantineMap.set(member.id, { roles: rToS, expiresAt: Date.now() + ms, guildId: interaction.guild.id });
      savedRoles[member.id] = { roles: rToS, expiresAt: Date.now() + ms, guildId: interaction.guild.id };
      saveRoles(savedRoles);
      const rRem = member.roles.cache.filter(r => r.id !== interaction.guild.id && r.editable);
      if (rRem.size > 0) await member.roles.remove(rRem);
      await member.roles.add(config.quarantineRole);
      
      // LOG MANUAL DE CUARENTENA (ÚNICO LUGAR)
      const logChId = config.logChannel || LOG_CHANNEL_ID;
      const channel = await interaction.guild.channels.fetch(logChId).catch(() => null);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🔒 Cuarentena Aplicada")
          .setColor(0xFFC107)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "👤 Usuario", value: `<@${member.id}>`, inline: true },
            { name: "🛡️ Moderador", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📝 Acción", value: "Usuario puesto en cuarentena", inline: false },
            { name: "⏱️ Duración", value: formatearDuracion(ms), inline: true }
          )
          .setFooter({ text: `${interaction.guild.name} • Moderación` })
          .setTimestamp();
        await channel.send({ content: `🔔 **Registro de Cuarentena:** <@${member.id}> | <@${interaction.user.id}>`, embeds: [embed] }).catch(() => {});
      }

      await interaction.editReply(`🔒 Cuarentena aplicada a ${member.user.tag}`);
    } else if (commandName === "liberar") {
      const member = interaction.options.getMember("usuario");
      if (!member) return interaction.editReply({ content: "❌ No se pudo encontrar al miembro." });

      // Validaciones de seguridad
      if (interaction.user.id === member.id) return interaction.editReply({ content: "No puedes usar este comando sobre ti mismo." });
      if (member.id === interaction.guild.ownerId) return interaction.editReply({ content: "No puedes moderar al dueño del servidor." });
      if (interaction.member.roles.highest.position <= member.roles.highest.position) return interaction.editReply({ content: "No puedes moderar a un usuario con un rol igual o superior al tuyo." });
      if (interaction.guild.members.me.roles.highest.position <= member.roles.highest.position) return interaction.editReply({ content: "Mi rol es demasiado bajo para moderar a este usuario." });

      await liberarUsuario(member, interaction.guild, quarantineMap.get(member.id) || savedRoles[member.id] || { roles: [] }, savedRoles, member.id, false, member.user);
      saveRoles(savedRoles);
      
      // LOG MANUAL DE LIBERACIÓN
      const logChId = config.logChannel || LOG_CHANNEL_ID;
      const channel = await interaction.guild.channels.fetch(logChId).catch(() => null);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🔓 Cuarentena Retirada")
          .setColor(0x4CAF50)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "👤 Usuario", value: `<@${member.id}>`, inline: true },
            { name: "🛡️ Moderador", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📝 Acción", value: "Liberado manualmente", inline: false }
          )
          .setFooter({ text: `${interaction.guild.name} • Moderación` })
          .setTimestamp();
        await channel.send({ content: `🔔 **Registro de Cuarentena:** <@${member.id}> | <@${interaction.user.id}>`, embeds: [embed] }).catch(() => {});
      }

      await interaction.editReply("🔓 Liberado");
      reconstruirDivisiones(interaction.guild);
    } else if (commandName === "reconstruir") {
      await reconstruirDivisiones(interaction.guild);
      await interaction.editReply("✅ Reconstruido");
    } else if (commandName === "warn") {
      const user = interaction.options.getUser("usuario");
      const member = interaction.options.getMember("usuario");
      const reason = interaction.options.getString("razon");

      if (member) {
        // Validaciones de seguridad primero
        if (interaction.user.id === member.id) return interaction.editReply({ content: "No puedes usar este comando sobre ti mismo." });
        if (member.id === interaction.guild.ownerId) return interaction.editReply({ content: "No puedes moderar al dueño del servidor." });
        if (interaction.member.roles.highest.position <= member.roles.highest.position) return interaction.editReply({ content: "No puedes moderar a un usuario con un rol igual o superior al tuyo." });
        if (interaction.guild.members.me.roles.highest.position <= member.roles.highest.position) return interaction.editReply({ content: "Mi rol es demasiado bajo para moderar a este usuario." });
      }

      const warns = loadWarns();
      if (!warns[user.id]) warns[user.id] = [];
      if (warns[user.id].length >= 5) return interaction.editReply({ content: "❌ Este usuario ya tiene el máximo de 5 warns." });
      
      const newWarn = { moderatorId: interaction.user.id, reason, date: Date.now() };
      warns[user.id].push(newWarn);
      saveWarns(warns);
      
      const logChId = config.logChannel || LOG_CHANNEL_ID;
      const channel = await interaction.guild.channels.fetch(logChId).catch(() => null);
      const embed = new EmbedBuilder()
        .setTitle("⚠️ Nuevo Warn")
        .setColor(0xFF5722)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "👤 Usuario", value: `<@${user.id}>`, inline: true },
          { name: "🛡️ Moderador", value: `<@${interaction.user.id}>`, inline: true },
          { name: "📅 Fecha", value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
          { name: "📌 Razón", value: reason, inline: false },
          { name: "⚠️ Total warns actual", value: `${warns[user.id].length}/5`, inline: true }
        )
        .setTimestamp();
      if (channel) await channel.send({ content: `🔔 **Nuevo Warn:** <@${user.id}>`, embeds: [embed] });
      await interaction.editReply({ content: `✅ Warn aplicado a <@${user.id}>. Total: ${warns[user.id].length}/5` });
    } else if (commandName === "warns") {
      const user = interaction.options.getUser("usuario");
      const warns = loadWarns();
      const userWarns = warns[user.id] || [];
      const embed = new EmbedBuilder()
        .setTitle(`📋 Warns de ${user.tag}`)
        .setColor(0x2196F3)
        .addFields(
          { name: "👤 Usuario", value: `<@${user.id}>`, inline: true },
          { name: "⚠️ Cantidad", value: `${userWarns.length}/5`, inline: true }
        );
      if (userWarns.length > 0) {
        embed.addFields({ name: "📅 Último warn", value: `<t:${Math.floor(userWarns[userWarns.length-1].date/1000)}:R>`, inline: true });
        const list = userWarns.slice(-5).map((w, i) => `**${i+1}.** <t:${Math.floor(w.date/1000)}:d> - Mod: <@${w.moderatorId}>\n└ Razón: ${w.reason}`).join("\n\n");
        embed.setDescription(list);
      } else {
        embed.setDescription("Este usuario no tiene warns.");
      }
      await interaction.editReply({ embeds: [embed] });
    } else if (commandName === "clearwarns") {
      const user = interaction.options.getUser("usuario");
      const member = interaction.options.getMember("usuario");

      if (member) {
        // Validaciones de seguridad
        if (interaction.user.id === member.id) return interaction.editReply({ content: "No puedes usar este comando sobre ti mismo." });
        if (member.id === interaction.guild.ownerId) return interaction.editReply({ content: "No puedes moderar al dueño del servidor." });
        if (interaction.member.roles.highest.position <= member.roles.highest.position) return interaction.editReply({ content: "No puedes moderar a un usuario con un rol igual o superior al tuyo." });
        if (interaction.guild.members.me.roles.highest.position <= member.roles.highest.position) return interaction.editReply({ content: "Mi rol es demasiado bajo para moderar a este usuario." });
      }

      const warns = loadWarns();
      if (warns[user.id]) {
        delete warns[user.id];
        saveWarns(warns);
        const logChId = config.logChannel || LOG_CHANNEL_ID;
        const channel = await interaction.guild.channels.fetch(logChId).catch(() => null);
        const embed = new EmbedBuilder()
          .setTitle("🧹 Warns Limpiados")
          .setColor(0x4CAF50)
          .addFields(
            { name: "👤 Usuario", value: `<@${user.id}>`, inline: true },
            { name: "🛡️ Moderador", value: `<@${interaction.user.id}>`, inline: true }
          )
          .setTimestamp();
        if (channel) await channel.send({ embeds: [embed] });
        await interaction.editReply({ content: `✅ Se han limpiado los warns de <@${user.id}>.` });
      } else {
        await interaction.editReply({ content: "Este usuario no tiene warns que limpiar." });
      }
    }
  } catch (e) { console.error(e); }
});

let isReconstructing = false, pendingReconstruction = false, lastReconstructTime = 0;
const RECONSTRUCT_COOLDOWN = 5000;

async function reconstruirDivisiones(guild) {
  if (!guild || isReconstructing) { if (guild) pendingReconstruction = true; return; }
  const now = Date.now();
  if (now - lastReconstructTime < RECONSTRUCT_COOLDOWN) {
    if (!pendingReconstruction) { pendingReconstruction = true; setTimeout(() => { pendingReconstruction = false; reconstruirDivisiones(guild); }, RECONSTRUCT_COOLDOWN - (now - lastReconstructTime)); }
    return;
  }
  isReconstructing = true; lastReconstructTime = now;
  try {
    const config = DIVISION_CONFIG;
    const channel = await guild.channels.fetch(config.CANAL_DIVISIONES_ID).catch(() => null);
    if (!channel?.isTextBased()) return;
    
    // Solo hacemos fetch si la cache está vacía o muy desactualizada
    if (guild.members.cache.size < (guild.memberCount * 0.9)) {
      await guild.members.fetch().catch(() => {});
    }
    const fetchList = (id) => {
      const r = guild.roles.cache.get(id);
      return r?.members.size > 0 ? r.members.map(m => `• ${m.user.toString()}`).join("\n") : "*Vacante*";
    };
    const getS = (id) => guild.roles.cache.get(id)?.members.size || 0;
    const embeds = [
      new EmbedBuilder().setTitle("👑 Liderazgo").setColor(0xFFA500).addFields(
        { name: "🥇 Capitán", value: fetchList(config.CAPITAN_ROLE_ID) },
        { name: "🥈 Vice Capitán", value: fetchList(config.VICE_ROLE_ID) },
        { name: "🥉 Tercer Capitán", value: fetchList(config.TERCER_CAPITAN_ROLE_ID) }
      ).setTimestamp(),
      ...[1, 2, 3, 4].map(n => {
        const c = config[`DIV${n}_CAP_ROLE_ID`], v = config[`DIV${n}_VICE_ROLE_ID`], m = config[`DIV${n}_ROLE_ID`];
        return new EmbedBuilder().setTitle(`⚔️ División ${n}`).setColor(0x3498DB).addFields({ name: "👑 Cap", value: fetchList(c), inline: true }, { name: "⭐ Vice", value: fetchList(v), inline: true }, { name: "⚔️ Miembros", value: fetchList(m), inline: false }).setFooter({ text: `Miembros: ${getS(c)+getS(v)+getS(m)} / 30` }).setTimestamp();
      })
    ];
    const msgs = await channel.messages.fetch({ limit: 10 });
    const botMsgs = msgs.filter(m => m.author.id === client.user.id).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    if (botMsgs.size === embeds.length) {
      const arr = Array.from(botMsgs.values());
      for (let i = 0; i < embeds.length; i++) await arr[i].edit({ embeds: [embeds[i]] }).catch(() => {});
    } else {
      for (const m of botMsgs.values()) await m.delete().catch(() => {});
      for (const e of embeds) await channel.send({ embeds: [e] });
    }
  } catch (e) { console.error(e); }
  finally {
    isReconstructing = false;
    if (pendingReconstruction) { pendingReconstruction = false; setTimeout(() => reconstruirDivisiones(guild), 1000); }
  }
}

async function enviarLogDivision(guild, user, accion, rolId, moderator = null) {
  const config = loadConfig();
  const ch = await guild.channels.fetch(config.logChannel || LOG_CHANNEL_ID).catch(() => null);
  if (!ch) return;

  const color = accion === "Agregado" ? 0x4CAF50 : 0xF44336;
  const modPing = moderator?.id && moderator.id !== "Desconocido" ? `<@${moderator.id}>` : "Desconocido";
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 Registro de División`)
    .setColor(color)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 Usuario", value: `<@${user.id}>`, inline: true },
      { name: "🛡️ Moderador", value: modPing, inline: true },
      { name: "🎭 Rol", value: `<@&${rolId}>`, inline: true },
      { name: "⚡ Acción", value: accion, inline: true }
    )
    .setFooter({ text: `${guild.name} • Sistema de Divisiones` })
    .setTimestamp();

  await ch.send({ content: `🔔 **Nuevo registro de división:** <@${user.id}> | ${modPing}`, embeds: [embed] }).catch(() => {});
}

// --- ÚNICO LISTENER PARA CAMBIOS DE ROLES (DIVISIONES) ---
if (!client._rolesListenerRegistered) {
  client._rolesListenerRegistered = true;

  client.on("guildMemberUpdate", async (oldM, newM) => {
    if (!oldM || !newM) return;
    const config = DIVISION_CONFIG;
    
    // 1️⃣ Calcular diferencias correctamente
    const added = newM.roles.cache.filter(r => !oldM.roles.cache.has(r.id));
    const removed = oldM.roles.cache.filter(r => !newM.roles.cache.has(r.id));

    if (added.size === 0 && removed.size === 0) return;

    // Roles de división estrictos para loguear (IDs)
    const logRoleIds = [
      config.CAPITAN_ROLE_ID,
      config.VICE_ROLE_ID,
      config.TERCER_CAPITAN_ROLE_ID,

      config.DIV1_ROLE_ID,
      config.DIV1_CAP_ROLE_ID,
      config.DIV1_VICE_ROLE_ID,

      config.DIV2_ROLE_ID,
      config.DIV2_CAP_ROLE_ID,
      config.DIV2_VICE_ROLE_ID,

      config.DIV3_ROLE_ID,
      config.DIV3_CAP_ROLE_ID,
      config.DIV3_VICE_ROLE_ID,

      config.DIV4_ROLE_ID,
      config.DIV4_CAP_ROLE_ID,
      config.DIV4_VICE_ROLE_ID
    ];

    // Reconstrucción visual siempre (incluye todos los roles de división)
    const hasDivChange = [...added.keys(), ...removed.keys()].some(id => logRoleIds.includes(id));
    if (hasDivChange) {
      reconstruirDivisiones(newM.guild);
    }

    // Filtrar cambios para logs
    const addedLog = added.filter(r => logRoleIds.includes(r.id));
    const removedLog = removed.filter(r => logRoleIds.includes(r.id));

    if (addedLog.size === 0 && removedLog.size === 0) return;

    // Evitar procesar el mismo cambio varias veces en milisegundos (Anti-duplicado)
    const now = Math.floor(Date.now() / 1000);
    const eventKey = `${newM.id}-${addedLog.first()?.id || removedLog.first()?.id}-${now}`;
    if (newM.guild._lastEv === eventKey) return;
    newM.guild._lastEv = eventKey;

    // Pequeño delay para dejar que Discord agrupe cambios de roles si se envían varios a la vez
    await new Promise(r => setTimeout(r, 1000));
    
    // Volver a verificar si ya procesamos este usuario en este segundo para evitar duplicados por ráfagas
    const userKey = `lock-${newM.id}-${now}`;
    if (newM.guild._lastUserLock === userKey) return;
    newM.guild._lastUserLock = userKey;

    // Obtener moderador desde Audit Logs
    let moderator = { id: "Desconocido" };
    try {
      const fetchedLogs = await newM.guild.fetchAuditLogs({ limit: 1, type: 25 }); // MEMBER_ROLE_UPDATE
      const entry = fetchedLogs.entries.first();
      if (entry && entry.target.id === newM.id && (Date.now() - entry.createdTimestamp < 15000)) {
        moderator = entry.executor;
      }
    } catch (e) {}

    // 3️⃣ Loguear AMBOS CASOS (si existen)
    const roleAdded = addedLog.first();
    const roleRemoved = removedLog.first();

    if (roleAdded) {
      await enviarLogDivision(newM.guild, newM.user, "Agregado", roleAdded.id, moderator);
    }

    if (roleRemoved) {
      await enviarLogDivision(newM.guild, newM.user, "Removido", roleRemoved.id, moderator);
    }
  });
}

client.on("guildMemberAdd", m => { reconstruirDivisiones(m.guild); });
client.on("guildMemberRemove", m => { reconstruirDivisiones(m.guild); });

client.login(process.env.TOKEN);