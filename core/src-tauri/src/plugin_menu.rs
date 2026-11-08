/*
 * Copyright (c) 2026 Robert Bosch Manufacturing Solutions GmbH
 *
 * See the AUTHORS file(s) distributed with this work for
 * additional information regarding authorship.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

//! Menu entries contributed by plugins.
//!
//! The UI knows the installed plugins and sends their localized entries via [`set_plugin_menu`].
//! Every call replaces the previous plugin entries, so the menu always reflects the running plugins.
//! A click on an entry is forwarded to the UI as [`PLUGIN_MENU_ACTION_EVENT`].

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem, MenuItemKind, Submenu};
use tauri::{AppHandle, Runtime};

const MENU_ITEM_PREFIX: &str = "PLUGIN::";
const MENU_ITEM_SEPARATOR: &str = "::";
const PLUGINS_SUBMENU_ID: &str = "MENU_PLUGINS";
const FILE_SUBMENU_ID: &str = "MENU_FILE";
const GENERATE_SUBMENU_ID: &str = "MENU_GENERATE";
const WINDOW_SUBMENU_ID: &str = "MENU_WINDOW";
/// Plugin imports follow the built-in import entries of the File menu.
const LAST_IMPORT_ITEM_ID: &str = "IMPORT_AAS";

pub const PLUGIN_MENU_ACTION_EVENT: &str = "PLUGIN_MENU_ACTION";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum PluginMenuLocation {
    #[serde(rename = "file/import")]
    FileImport,
    #[serde(rename = "generate")]
    Generate,
    #[serde(rename = "plugins")]
    Plugins,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMenuEntry {
    pub plugin_id: String,
    pub entry_id: String,
    pub label: String,
    pub location: PluginMenuLocation,
    /// Generator entries are disabled while no Aspect Model is open.
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
}

fn enabled_by_default() -> bool {
    true
}

/// All plugin entries plus the localized title of the "Plugins" menu.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMenu {
    pub title: String,
    pub entries: Vec<PluginMenuEntry>,
}

/// Payload of [`PLUGIN_MENU_ACTION_EVENT`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMenuAction {
    pub plugin_id: String,
    pub entry_id: String,
}

pub fn menu_item_id(plugin_id: &str, entry_id: &str) -> String {
    format!("{MENU_ITEM_PREFIX}{plugin_id}{MENU_ITEM_SEPARATOR}{entry_id}")
}

/// Returns the plugin entry behind a menu item id, or `None` for built-in items.
pub fn parse_menu_item_id(id: &str) -> Option<PluginMenuAction> {
    let (plugin_id, entry_id) = id
        .strip_prefix(MENU_ITEM_PREFIX)?
        .split_once(MENU_ITEM_SEPARATOR)?;
    (!plugin_id.is_empty() && !entry_id.is_empty()).then(|| PluginMenuAction {
        plugin_id: plugin_id.to_string(),
        entry_id: entry_id.to_string(),
    })
}

fn is_plugin_item<R: Runtime>(item: &MenuItemKind<R>) -> bool {
    let id = item.id().as_ref();
    id.starts_with(MENU_ITEM_PREFIX) || id == PLUGINS_SUBMENU_ID
}

/// Replaces the plugin entries of the application menu.
/// Replaces the plugin entries of the menu bar with the entries sent by the UI.
#[tauri::command]
pub fn set_plugin_menu<R: Runtime>(app: AppHandle<R>, menu: PluginMenu) -> Result<(), String> {
    apply_plugin_menu(&app, &menu).map_err(|e| e.to_string())
}

pub fn apply_plugin_menu<R: Runtime>(
    app: &AppHandle<R>,
    plugin_menu: &PluginMenu,
) -> tauri::Result<()> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    remove_plugin_items(&menu)?;

    if let Some(file) = submenu(&menu, FILE_SUBMENU_ID)? {
        let position = file
            .items()?
            .iter()
            .position(|item| item.id().as_ref() == LAST_IMPORT_ITEM_ID)
            .map_or(0, |index| index + 1);
        for (offset, entry) in plugin_menu
            .entries_at(PluginMenuLocation::FileImport)
            .enumerate()
        {
            file.insert(&menu_item(app, entry)?, position + offset)?;
        }
    }

    if let Some(generate) = submenu(&menu, GENERATE_SUBMENU_ID)? {
        append_items(
            app,
            &generate,
            plugin_menu.entries_at(PluginMenuLocation::Generate),
        )?;
    }

    let mut plugin_entries = plugin_menu
        .entries_at(PluginMenuLocation::Plugins)
        .peekable();
    if plugin_entries.peek().is_some() {
        let plugins = Submenu::with_id(app, PLUGINS_SUBMENU_ID, &plugin_menu.title, true)?;
        append_items(app, &plugins, plugin_entries)?;
        let items = menu.items()?;
        let position = items
            .iter()
            .position(|item| item.id().as_ref() == WINDOW_SUBMENU_ID)
            .unwrap_or(items.len());
        menu.insert(&plugins, position)?;
    }
    Ok(())
}

impl PluginMenu {
    fn entries_at(
        &self,
        location: PluginMenuLocation,
    ) -> impl Iterator<Item = &PluginMenuEntry> + '_ {
        self.entries
            .iter()
            .filter(move |entry| entry.location == location)
    }
}

fn append_items<'a, R: Runtime>(
    app: &AppHandle<R>,
    submenu: &Submenu<R>,
    entries: impl IntoIterator<Item = &'a PluginMenuEntry>,
) -> tauri::Result<()> {
    for entry in entries {
        submenu.append(&menu_item(app, entry)?)?;
    }
    Ok(())
}

fn menu_item<R: Runtime>(
    app: &AppHandle<R>,
    entry: &PluginMenuEntry,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(
        app,
        menu_item_id(&entry.plugin_id, &entry.entry_id),
        &entry.label,
        entry.enabled,
        None::<&str>,
    )
}

fn submenu<R: Runtime>(menu: &Menu<R>, id: &str) -> tauri::Result<Option<Submenu<R>>> {
    Ok(menu.items()?.into_iter().find_map(|item| match item {
        MenuItemKind::Submenu(submenu) if submenu.id().as_ref() == id => Some(submenu),
        _ => None,
    }))
}

fn remove_plugin_items<R: Runtime>(menu: &Menu<R>) -> tauri::Result<()> {
    for index in plugin_item_positions(&menu.items()?) {
        menu.remove_at(index)?;
    }
    for id in [FILE_SUBMENU_ID, GENERATE_SUBMENU_ID] {
        if let Some(submenu) = submenu(menu, id)? {
            for index in plugin_item_positions(&submenu.items()?) {
                submenu.remove_at(index)?;
            }
        }
    }
    Ok(())
}

/// Positions of plugin items, last first, so removing them one by one keeps the remaining positions valid.
fn plugin_item_positions<R: Runtime>(items: &[MenuItemKind<R>]) -> Vec<usize> {
    let mut positions: Vec<usize> = items
        .iter()
        .enumerate()
        .filter(|(_, item)| is_plugin_item(item))
        .map(|(index, _)| index)
        .collect();
    positions.reverse();
    positions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_item_ids_round_trip() {
        let id = menu_item_id("example-import", "import");
        assert_eq!(id, "PLUGIN::example-import::import");
        assert_eq!(
            parse_menu_item_id(&id),
            Some(PluginMenuAction {
                plugin_id: "example-import".to_string(),
                entry_id: "import".to_string(),
            })
        );
    }

    #[test]
    fn entry_ids_may_contain_dots() {
        let action = parse_menu_item_id("PLUGIN::example-import::import.v2").unwrap();
        assert_eq!(action.entry_id, "import.v2");
    }

    #[test]
    fn built_in_and_malformed_ids_are_no_plugin_entries() {
        assert_eq!(parse_menu_item_id("IMPORT_MODEL"), None);
        assert_eq!(parse_menu_item_id("PLUGIN::example-import"), None);
        assert_eq!(parse_menu_item_id("PLUGIN::::import"), None);
        assert_eq!(parse_menu_item_id("PLUGIN::example-import::"), None);
    }

    #[test]
    fn deserializes_the_menu_sent_by_the_ui() {
        let menu: PluginMenu = serde_json::from_value(serde_json::json!({
            "title": "Plugins",
            "entries": [
                {"pluginId": "a", "entryId": "x", "label": "Import X", "location": "file/import"},
                {"pluginId": "a", "entryId": "y", "label": "Generate Y", "location": "generate", "enabled": false},
                {"pluginId": "b", "entryId": "z", "label": "Z", "location": "plugins"}
            ]
        }))
        .unwrap();

        assert_eq!(menu.title, "Plugins");
        assert_eq!(
            menu.entries
                .iter()
                .map(|entry| entry.location)
                .collect::<Vec<_>>(),
            vec![
                PluginMenuLocation::FileImport,
                PluginMenuLocation::Generate,
                PluginMenuLocation::Plugins
            ]
        );
        assert_eq!(
            menu.entries
                .iter()
                .map(|entry| entry.enabled)
                .collect::<Vec<_>>(),
            vec![true, false, true]
        );
    }

    #[test]
    fn rejects_unknown_locations() {
        let entry = serde_json::from_value::<PluginMenuEntry>(serde_json::json!(
            {"pluginId": "a", "entryId": "x", "label": "X", "location": "edit"}
        ));
        assert!(entry.is_err());
    }
}
