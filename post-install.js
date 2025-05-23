/**
 * Scripts to be done before starting the server for the first time.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import yaml from 'yaml';
import _ from 'lodash';
import chalk from 'chalk';
import { createRequire } from 'node:module';

/**
 * Colorizes console output.
 */
const color = chalk;

const keyMigrationMap = [
    {
        oldKey: 'disableThumbnails',
        newKey: 'thumbnails.enabled',
        migrate: (value) => !value,
    },
    {
        oldKey: 'thumbnailsQuality',
        newKey: 'thumbnails.quality',
        migrate: (value) => value,
    },
    {
        oldKey: 'avatarThumbnailsPng',
        newKey: 'thumbnails.format',
        migrate: (value) => (value ? 'png' : 'jpg'),
    },
    {
        oldKey: 'disableChatBackup',
        newKey: 'backups.chat.enabled',
        migrate: (value) => !value,
    },
    {
        oldKey: 'numberOfBackups',
        newKey: 'backups.common.numberOfBackups',
        migrate: (value) => value,
    },
    {
        oldKey: 'maxTotalChatBackups',
        newKey: 'backups.chat.maxTotalBackups',
        migrate: (value) => value,
    },
    {
        oldKey: 'chatBackupThrottleInterval',
        newKey: 'backups.chat.throttleInterval',
        migrate: (value) => value,
    },
    {
        oldKey: 'enableExtensions',
        newKey: 'extensions.enabled',
        migrate: (value) => value,
    },
    {
        oldKey: 'enableExtensionsAutoUpdate',
        newKey: 'extensions.autoUpdate',
        migrate: (value) => value,
    },
    {
        oldKey: 'extras.disableAutoDownload',
        newKey: 'extensions.models.autoDownload',
        migrate: (value) => !value,
    },
    {
        oldKey: 'extras.classificationModel',
        newKey: 'extensions.models.classification',
        migrate: (value) => value,
    },
    {
        oldKey: 'extras.captioningModel',
        newKey: 'extensions.models.captioning',
        migrate: (value) => value,
    },
    {
        oldKey: 'extras.embeddingModel',
        newKey: 'extensions.models.embedding',
        migrate: (value) => value,
    },
    {
        oldKey: 'extras.speechToTextModel',
        newKey: 'extensions.models.speechToText',
        migrate: (value) => value,
    },
    {
        oldKey: 'extras.textToSpeechModel',
        newKey: 'extensions.models.textToSpeech',
        migrate: (value) => value,
    },
    {
        oldKey: 'minLogLevel',
        newKey: 'logging.minLogLevel',
        migrate: (value) => value,
    },
    {
        oldKey: 'cardsCacheCapacity',
        newKey: 'performance.memoryCacheCapacity',
        migrate: (value) => `${value}mb`,
    },
    {
        oldKey: 'cookieSecret',
        newKey: 'cookieSecret',
        migrate: () => void 0,
        remove: true,
    },
];

/**
 * Gets all keys from an object recursively.
 * @param {object} obj Object to get all keys from
 * @param {string} prefix Prefix to prepend to all keys
 * @returns {string[]} Array of all keys in the object
 */
function getAllKeys(obj, prefix = '') {
    if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) {
        return [];
    }

    return _.flatMap(Object.keys(obj), key => {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            return getAllKeys(obj[key], newPrefix);
        } else {
            return [newPrefix];
        }
    });
}

/**
 * Converts the old config.conf file to the new config.yaml format.
 */
function convertConfig() {
    if (fs.existsSync('./config.conf')) {
        if (fs.existsSync('./config.yaml')) {
            console.log(color.yellow('Both config.conf and config.yaml exist. Please delete config.conf manually.'));
            return;
        }

        try {
            console.log(color.blue('Converting config.conf to config.yaml. Your old config.conf will be renamed to config.conf.bak'));
            fs.renameSync('./config.conf', './config.conf.cjs'); // Force loading as CommonJS
            const require = createRequire(import.meta.url);
            const config = require(path.join(process.cwd(), './config.conf.cjs'));
            fs.copyFileSync('./config.conf.cjs', './config.conf.bak');
            fs.rmSync('./config.conf.cjs');
            fs.writeFileSync('./config.yaml', yaml.stringify(config));
            console.log(color.green('Conversion successful. Please check your config.yaml and fix it if necessary.'));
        } catch (error) {
            console.error(color.red('FATAL: Config conversion failed. Please check your config.conf file and try again.'), error);
            return;
        }
    }
}

/**
 * Compares the current config.yaml with the default config.yaml and adds any missing values.
 */
function addMissingConfigValues() {
    try {
        const defaultConfig = yaml.parse(fs.readFileSync(path.join(process.cwd(), './default/config.yaml'), 'utf8'));
        let config = yaml.parse(fs.readFileSync(path.join(process.cwd(), './config.yaml'), 'utf8'));

        // Migrate old keys to new keys
        const migratedKeys = [];
        for (const { oldKey, newKey, migrate, remove } of keyMigrationMap) {
            if (_.has(config, oldKey)) {
                if (remove) {
                    _.unset(config, oldKey);
                    migratedKeys.push({
                        oldKey,
                        newValue: void 0,
                    });
                    continue;
                }

                const oldValue = _.get(config, oldKey);
                const newValue = migrate(oldValue);
                _.set(config, newKey, newValue);
                _.unset(config, oldKey);

                migratedKeys.push({
                    oldKey,
                    newKey,
                    oldValue,
                    newValue,
                });
            }
        }

        // Get all keys from the original config
        const originalKeys = getAllKeys(config);

        // Use lodash's defaultsDeep function to recursively apply default properties
        config = _.defaultsDeep(config, defaultConfig);

        // Get all keys from the updated config
        const updatedKeys = getAllKeys(config);

        // Find the keys that were added
        const addedKeys = _.difference(updatedKeys, originalKeys);

        if (addedKeys.length === 0 && migratedKeys.length === 0) {
            return;
        }

        if (addedKeys.length > 0) {
            console.log('Adding missing config values to config.yaml:', addedKeys);
        }

        if (migratedKeys.length > 0) {
            console.log('Migrating config values in config.yaml:', migratedKeys);
        }

        fs.writeFileSync('./config.yaml', yaml.stringify(config));
    } catch (error) {
        console.error(color.red('FATAL: Could not add missing config values to config.yaml'), error);
    }
}

/**
 * Creates the default config files if they don't exist yet.
 */
function createDefaultFiles() {
    /**
     * @typedef DefaultItem
     * @type {object}
     * @property {'file' | 'directory'} type - Whether the item should be copied as a single file or merged into a directory structure.
     * @property {string} defaultPath - The path to the default item (typically in `default/`).
     * @property {string} productionPath - The path to the copied item for production use.
     */

    /** @type {DefaultItem[]} */
    const defaultItems = [
        {
            type: 'file',
            defaultPath: './default/config.yaml',
            productionPath: './config.yaml',
        },
        {
            type: 'directory',
            defaultPath: './default/public/',
            productionPath: './public/',
        },
    ];

    for (const defaultItem of defaultItems) {
        try {
            if (defaultItem.type === 'file') {
                if (!fs.existsSync(defaultItem.productionPath)) {
                    fs.copyFileSync(
                        defaultItem.defaultPath,
                        defaultItem.productionPath,
                    );
                    console.log(
                        color.green(`Created default file: ${defaultItem.productionPath}`),
                    );
                }
            } else if (defaultItem.type === 'directory') {
                fs.cpSync(defaultItem.defaultPath, defaultItem.productionPath, {
                    force: false, // Don't overwrite existing files!
                    recursive: true,
                });
                console.log(
                    color.green(`Synchronized missing files: ${defaultItem.productionPath}`),
                );
            } else {
                throw new Error(
                    'FATAL: Unexpected default file format in `post-install.js#createDefaultFiles()`.',
                );
            }
        } catch (error) {
            console.error(
                color.red(
                    `FATAL: Could not write default ${defaultItem.type}: ${defaultItem.productionPath}`,
                ),
                error,
            );
        }
    }
}

/**
 * Returns the MD5 hash of the given data.
 * @param {Buffer} data Input data
 * @returns {string} MD5 hash of the input data
 */
function getMd5Hash(data) {
    return crypto
        .createHash('md5')
        .update(new Uint8Array(data))
        .digest('hex');
}

/**
 * Copies the WASM binaries from the sillytavern-transformers package to the dist folder.
 */
function copyWasmFiles() {
    if (!fs.existsSync('./dist')) {
        fs.mkdirSync('./dist');
    }

    const listDir = fs.readdirSync('./node_modules/sillytavern-transformers/dist');

    for (const file of listDir) {
        if (file.endsWith('.wasm')) {
            const sourcePath = `./node_modules/sillytavern-transformers/dist/${file}`;
            const targetPath = `./dist/${file}`;

            // Don't copy if the file already exists and is the same checksum
            if (fs.existsSync(targetPath)) {
                const sourceChecksum = getMd5Hash(fs.readFileSync(sourcePath));
                const targetChecksum = getMd5Hash(fs.readFileSync(targetPath));

                if (sourceChecksum === targetChecksum) {
                    continue;
                }
            }

            fs.copyFileSync(sourcePath, targetPath);
            console.log(`${file} successfully copied to ./dist/${file}`);
        }
    }
}

try {
    // 0. Convert config.conf to config.yaml
    convertConfig();
    // 1. Create default config files
    createDefaultFiles();
    // 2. Copy transformers WASM binaries from node_modules
    copyWasmFiles();
    // 3. Add missing config values
    addMissingConfigValues();
} catch (error) {
    console.error(error);
}
