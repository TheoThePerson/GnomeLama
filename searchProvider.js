const { St } = imports.gi;
const Main = imports.ui.main;
const Utils = Me.imports.utils;

class OllamaSearchProvider {
    constructor() {
        this._soupSession = Utils.makeSoupSession();
        this.id = 'OllamaSearchProvider';
    }

    getResultMetas(resultIds, callback) {
        let results = resultIds.map(id => ({
            id: id,
            name: `Response: ${id}`,
            createIcon: size => new St.Icon({ icon_name: 'edit-find-symbolic', icon_size: size })
        }));
        callback(results);
    }

    activateResult(resultId) {
        // Do something when a result is activated
    }

    filterResults(results, max) {
        return results.slice(0, max);
    }

    getInitialResultSet(terms, callback) {
        let query = terms.join(' ');
        if (query.startsWith('\\')) {
            query = query.slice(1);
            let ollamaUrl = 'http://localhost:11343';
            if (Utils.checkOllamaInstallation() === true) {
                Utils.sendChatMessage(this._soupSession, ollamaUrl, query, (response, error) => {
                    if (error) {
                        callback([`Error: ${error.message}`]);
                    } else {
                        callback([response.message]);
                    }
                });
            } else {
                callback([Utils.checkOllamaInstallation()]);
            }
        } else {
            callback([]);
        }
    }

    getSubsearchResultSet(previousResults, terms, callback) {
        this.getInitialResultSet(terms, callback);
    }
}

function init() {
    return new OllamaSearchProvider();
}
