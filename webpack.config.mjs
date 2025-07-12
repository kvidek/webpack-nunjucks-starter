// Import required modules
import TerserPlugin from "terser-webpack-plugin";
import path from "path";
import webpack from "webpack";
import BrowserSyncPlugin from "browser-sync-v3-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import RemoveEmptyScriptsPlugin from "webpack-remove-empty-scripts";

import HtmlWebpackPlugin from "html-webpack-plugin";
import nunjucks from "nunjucks";
import fs from "fs";

// ReferenceError: __dirname is not defined in ES module scope
const __dirname = path.resolve();

// Function to discover all .njk files in directories
function discoverTemplateFiles() {
    const templateFiles = [];

    const discoverFiles = (dir) => {
        try {
            const files = fs.readdirSync(dir);
            files.forEach((file) => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    discoverFiles(filePath);
                } else if (file.endsWith(".njk")) {
                    templateFiles.push(filePath);
                }
            });
        } catch (error) {
            // Directory might not exist
        }
    };

    // Discover files in pages and partials directories
    discoverFiles(path.resolve(__dirname, "pages"));
    discoverFiles(path.resolve(__dirname, "partials"));

    return templateFiles;
}

// Function to discover page templates and create page configurations
function discoverPages() {
    const pages = [];

    try {
        const pageFiles = fs.readdirSync(path.resolve(__dirname, "pages"));
        pageFiles.forEach((file) => {
            if (file.endsWith(".njk")) {
                const pageName = file.replace(".njk", "");
                const title = pageName.charAt(0).toUpperCase() + pageName.slice(1);

                // Define basic page data
                const pageData = {
                    title: title,
                    pageName: pageName,
                    meta: {
                        description: `${title} page description`,
                        keywords: `${pageName}, website`,
                    },
                };

                pages.push({
                    name: pageName,
                    template: `./pages/${file}`,
                    filename: path.resolve(__dirname, "static", "dist", "HTML", `${pageName === "home" ? "index" : pageName}.html`),
                    title: title,
                    templateParameters: pageData,
                });
            }
        });
    } catch (error) {
        console.warn("Pages directory not found or empty");
    }

    return pages;
}

// Custom template function to process Nunjucks includes
function processNunjucksTemplate(templatePath, options) {
    const env = nunjucks.configure(
        [path.resolve(__dirname, "pages"), path.resolve(__dirname, "partials"), path.resolve(__dirname, "partials/components")],
        {
            autoescape: false,
            noCache: true,
        },
    );

    const template = nunjucks.render(path.basename(templatePath), options);
    return template;
}

export default (env, argv) => {
    const mode = argv.mode;
    console.log(`Running in ${mode} mode...`);
    console.log(env);

    // Define the proxy URL for BrowserSync
    const proxy = "http://www.private.loc/webpack-nunjucks-starter/";

    // Define the entry points for the webpack build
    const entry = {
        bundle: "./static/js/index.js",
        style: ["./static/scss/style.scss"],
        // Add template files as dependencies to ensure they're watched
        templates: discoverTemplateFiles(),
    };

    // Define the plugins to be used in the webpack build
    const plugins = [
        // Start BrowserSync and reload the page when files change
        new BrowserSyncPlugin(
            {
                proxy: proxy,
                files: ["static/dist/*.js", "static/dist/*.css", "**/*.php", "**/*.html"],
                injectCss: true,
                open: false,
            },
            {
                reload: false,
            },
        ),
        // Remove empty script tags from the JS output
        new RemoveEmptyScriptsPlugin({ verbose: false }),
        // Extract CSS into separate files
        new MiniCssExtractPlugin({
            filename: "[name].css",
        }),
    ];

    // Add HTML pages
    const pages = discoverPages();

    // Add HtmlWebpackPlugin for each page
    pages.forEach((page) => {
        plugins.push(
            new HtmlWebpackPlugin({
                template: page.template,
                filename: page.filename,
                title: page.title,
                inject: false,
                minify: false,
                templateParameters: page.templateParameters,
                templateContent: (templateParams) => {
                    return processNunjucksTemplate(page.template, templateParams);
                },
            }),
        );
    });

    // Add a source map for easier debugging in development mode
    if (mode === "development") {
        plugins.push(
            new webpack.SourceMapDevToolPlugin({
                filename: "[file].map[query]",
            }),
        );
    }

    // Define the webpack configuration object
    return {
        // Define the entry points from `entry` variable
        entry: entry,
        // Define the output directory and file names
        output: {
            filename: "[name].js",
            path: path.resolve(__dirname, "static", "dist"),
            clean: {
                keep: /.gitkeep|vendor.js/,
            },
        },
        // Add support for importing only .js files
        resolve: { extensions: [".js"] },
        // Define the plugins to be used from `plugins` variable
        plugins: plugins,
        module: {
            rules: [
                {
                    // Handle .js files with babel-loader
                    test: /\.(js)$/,
                    exclude: /node_modules/,
                    use: ["babel-loader"],
                },
                {
                    // Handle .njk files as empty modules for dependency tracking
                    test: /\.njk$/,
                    use: "null-loader",
                },
                // Remove the .njk loader - let html-webpack-plugin handle it directly
                {
                    // Handle .scss files with sass-loader, css-loader, and MiniCssExtractPlugin
                    test: /\.s[ac]ss$/i,
                    use: [
                        // Extract CSS into separate file
                        MiniCssExtractPlugin.loader,
                        {
                            loader: "css-loader",
                            options: {
                                // Disable URL handling in CSS
                                url: false,
                            },
                        },
                        // Compile SCSS to CSS
                        "sass-loader",
                    ],
                },
                {
                    // Match .css files
                    test: /\.css$/i,
                    use: [
                        {
                            loader: "css-loader",
                            options: {
                                // Disable URL handling in CSS
                                url: false,
                            },
                        },
                    ],
                },
            ],
        },
        // https://webpack.js.org/plugins/split-chunks-plugin/#optimizationsplitchunks
        optimization: {
            splitChunks: {
                chunks: "all", // Optimization should be applied to all chunks, including the entry chunk and the chunks created by import().
                minSize: 20000, // Minimum size in bytes of a chunk before it can be split. In this case, a chunk must be at least 20 kilobytes before it can be split.
                minRemainingSize: 0, // Minimum size in bytes of the remaining chunk after splitting. If the remaining chunk is smaller than this size, it won't be split. In this case, there is no minimum size requirement.
                minChunks: 1, // Minimum number of chunks that must share a module before the module is split into a separate chunk. In this case, any module that is used in at least one chunk will be split into a separate chunk.
                maxAsyncRequests: 30, // Maximum number of parallel requests for the chunks that are loaded asynchronously. In this case, a maximum of 30 parallel requests will be made.
                maxInitialRequests: 30, // Maximum number of parallel requests for the chunks that are loaded on the initial page load. In this case, a maximum of 30 parallel requests will be made.
                enforceSizeThreshold: 50000, // Threshold size in bytes for enforcing the minRemainingSize option. If the remaining chunk after splitting is larger than this size, the minRemainingSize option will be enforced. In this case, the threshold is 50 kilobytes.
                /**
                 * `cacheGroups` is an Object that allows you to group chunks
                 * and customize their behavior. The vendor cache group is
                 * used to group all modules from the node_modules folder into
                 * a single chunk, which is named vendor. The default cache
                 * group is used to group modules that don't belong to the
                 * node_modules folder into a separate chunk, which is named
                 * based on the chunk's ID. Both cache groups have a priority
                 * option that determines the order in which they are
                 * processed.
                 *
                 * The reuseExistingChunk option is set to true for both cache
                 * groups to allow them to reuse existing chunks when possible.
                 */
                cacheGroups: {
                    vendor: {
                        test: /[\\/]node_modules[\\/]/,
                        priority: -10,
                        reuseExistingChunk: true,
                        name: "vendor",
                    },
                    default: {
                        minChunks: 2,
                        priority: -20,
                        reuseExistingChunk: true,
                    },
                },
            },
            minimize: true,
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        compress: {
                            pure_funcs: ["console.log"],
                        },
                    },
                }),
            ],
        },
    };
};
