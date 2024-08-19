const { St, Gio, Shell, GLib } = imports.gi;
const Main = imports.ui.main;
const Search = imports.ui.search;

class OllamaSearchProvider extends Search.SearchProvider {
    constructor(extension) {
        super('Ollama Search');
        this.extension = extension;
    }

    async getInitialResultSet(terms, callback) {
        let results = await this.extension.handleSearch(terms.join(' '));
        callback(results ? [results] : []);
    }

    async getSubsearchResultSet(previousResults, terms, callback) {
        let results = await this.extension.handleSearch(terms.join(' '));
        callback(results ? [results] : []);
    }

    getResultMetas(resultIds, callback) {
        let metas = resultIds.map(result => ({
            id: result,
            name: result,
            description: 'Ollama Search Result',
            createIcon: size => new St.Icon({ icon_name: 'system-search-symbolic', icon_size: size })
        }));
        callback(metas);
    }

    activateResult(resultId, terms) {
        Util.spawn(['xdg-open', resultId]);
    }
}

function init(extension) {
    return new OllamaSearchProvider(extension);
}
