import sortBy from 'lodash/sortBy';
import xml from 'xml';
import moment from 'moment';
import path from 'path';

import * as utils from './utils';

// Sitemap specific xml namespace declarations that should not change
const XMLNS_DECLS = {
    _attr: {
        xmlns: `http://www.sitemaps.org/schemas/sitemap/0.9`,
        'xmlns:image': `http://www.google.com/schemas/sitemap-image/1.1`,
        "xmlns:news": `http://www.google.com/schemas/sitemap-news/0.9`,
    },
};

export default class BaseSiteMapGenerator {
    ISO8601_FORMAT = `YYYY-MM-DDTHH:mm:ssZ`;
    constructor() {
        this.nodeLookup = {};
        this.nodeTimeLookup = {};
        this.siteMapContent = null;
        this.lastModified = 0;
    }

    generateXmlFromNodes(options) {
        const self = this;
        // Get a mapping of node to timestamp
        const timedNodes = Object.values(this.nodeLookup).map((node, id) => {
            return {
                id: id,
                // Using negative here to sort newest to oldest
                ts: -(self.nodeTimeLookup[id] || 0),
                node: node,
            };
        });
        // Sort nodes by timestamp
        const sortedNodes = sortBy(timedNodes, `ts`);
        // Grab just the nodes
        const urlElements = sortedNodes.map(el => el.node);
        const data = {
            // Concat the elements to the _attr declaration
            urlset: [XMLNS_DECLS].concat(urlElements),
        };

        // Return the xml
        return utils.sitemapsUtils.getDeclarations(options) + xml(data);
    }

    addUrl(url, datum) {
        const node = this.createUrlNodeFromDatum(url, datum);

        if (node) {
            this.updateLastModified(datum);
            this.updateLookups(datum, node);
            // force regeneration of xml
            this.siteMapContent = null;
        }
    }

    removeUrl(url, datum) {
        this.removeFromLookups(datum);

        // force regeneration of xml
        this.siteMapContent = null;
        this.lastModified = moment(new Date());
    }

    getLastModifiedForDatum(datum) {
        if (datum.updated_at || datum.published_at || datum.created_at) {
            const modifiedDate =
                datum.updated_at || datum.published_at || datum.created_at;

            return moment(new Date(modifiedDate));
        } else {
            return moment(new Date());
        }
    }

    getPublishedAtForDatum(datum) {
        if (datum.published_at || datum.created_at || datum.updated_at) {
            const publishedAt =
                datum.published_at || datum.created_at || datum.updated_at;

            return moment(new Date(publishedAt));
        } else {
            return moment(new Date());
        }
    }

    updateLastModified(datum) {
        const lastModified = this.getLastModifiedForDatum(datum);

        if (!this.lastModified || lastModified > this.lastModified) {
            this.lastModified = lastModified;
        }
    }

    createNewsNodeFromDatum(datum) {
        // Check for cover first because user has cover but the rest only have image
        const news = datum.type_news;
        let newsEl;
        if (!news) {
            return;
        }
        // Create the weird xml node syntax structure that is expected
        newsEl = [
            {
                "news:publication": [
                    { "news:name": "Fortune Education" },
                    { "news:language": "en" },
                ],
            },
            {
                "news:publication_date": moment(
                    this.getPublishedAtForDatum(datum),
                    moment.ISO_8601
                ).toISOString(),
            },
            { "news:title": datum.title },
        ];
        // Return the node to be added to the url xml node
        return { "news:news": newsEl }; //eslint-disable-line
    }

    createUrlNodeFromDatum(url, datum) {
        let node, imgNode, newsNode;

        node = {
            url: [
                { loc: url },
                {
                    lastmod: moment(
                        this.getLastModifiedForDatum(datum),
                        moment.ISO_8601
                    ).toISOString(),
                },
            ],
        };

        imgNode = this.createImageNodeFromDatum(datum);
        if (imgNode) {
            node.url.push(imgNode);
        }

        newsNode = this.createNewsNodeFromDatum(datum);
        if (newsNode) {
            node.url.push(newsNode);
        }
        return node;
    }

    createImageNodeFromDatum(datum) {
        // Check for cover first because user has cover but the rest only have image
        const image =
            datum.cover_image || datum.profile_image || datum.feature_image;
        let imageEl;

        if (!image) {
            return;
        }

        // Create the weird xml node syntax structure that is expected
        imageEl = [
            { 'image:loc': image },
            { 'image:caption': path.basename(image) },
        ];

        // Return the node to be added to the url xml node
        return { "image:image": imageEl }; //eslint-disable-line
    }

    validateImageUrl(imageUrl) {
        return !!imageUrl;
    }

    getXml(options) {
        if (this.siteMapContent) {
            return this.siteMapContent;
        }

        const content = this.generateXmlFromNodes(options);
        this.siteMapContent = content;
        return content;
    }

    /**
     * @NOTE
     * The url service currently has no url update event.
     * It removes and adds the url. If the url service extends it's
     * feature set, we can detect if a node has changed.
     */
    updateLookups(datum, node) {
        this.nodeLookup[datum.id] = node;
        this.nodeTimeLookup[datum.id] = this.getLastModifiedForDatum(datum);
    }

    removeFromLookups(datum) {
        delete this.nodeLookup[datum.id];
        delete this.nodeTimeLookup[datum.id];
    }

    reset() {
        this.nodeLookup = {};
        this.nodeTimeLookup = {};
        this.siteMapContent = null;
    }
}
