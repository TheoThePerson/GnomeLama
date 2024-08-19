const { St, Clutter, GLib, Gio, Gtk, PopupMenu, Shell } = imports.gi;
const Main = imports.ui.main;
const Search = imports.ui.search;
const Util = imports.misc.util;

class OllamaSearchProvider extends Search.SearchProvider {
    constructor(extension) {
        super('Ollama');
        this._extension = extension;
    }

    getInitialResultSet(terms, callback) {
        let query = terms.join(' ');
        this._extension.handleSearch(query).then(response => {
            callback([response]);
        });
    }

    getSubsearchResultSet(previousResults, terms, callback) {
        let query = terms.join(' ');
        this._extension.handleSearch(query).then(response => {
            callback([response]);
        });
    }

    getResultMetas(resultIds) {
        return resultIds.map((resultId) => {
            return {
                id: resultId,
                name: resultId,
                createIcon: () => new St.Icon({ icon_name: 'system-run-symbolic', style_class: 'popup-menu-icon' })
            };
        });
    }

    activateResult(resultId) {
        this._extension._chatEntry.set_text(resultId);
        this._extension._handleChatSubmit();
    }
}

function init(extension) {
    return new OllamaSearchProvider(extension);
}
