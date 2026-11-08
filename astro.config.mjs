import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import rehypeTableWrap from './src/plugins/rehype-table-wrap.mjs';

const REGISTRY = 'https://github.com/HisokaLabs/open-subdomains';

export default defineConfig({
	site: 'https://docs.is-a.ceo',
	markdown: {
		processor: unified({
			rehypePlugins: [rehypeTableWrap],
		}),
	},
	integrations: [
		starlight({
			title: 'open-subdomains docs',
			description:
				'How the is-a.ceo registry works: claiming a name, the entry format, the validator, the CI workflows and the DNS pipeline.',
			customCss: ['./src/styles/custom.css'],
			favicon: '/favicon.svg',
			social: [{ icon: 'github', label: 'GitHub', href: REGISTRY }],
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
			disable404Route: true,
			expressiveCode: {
				themes: ['min-light', 'min-dark'],
				styleOverrides: { borderRadius: '10px', borderColor: 'var(--isa-line)' },
			},
			components: {
				SiteTitle: './src/components/SiteTitle.astro',
			},
			sidebar: [
				{
					label: 'Start',
					items: [
						{ label: 'Overview', link: '/' },
						{ label: 'Claim a subdomain', link: '/claim/' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Entry fields', link: '/fields/' },
						{ label: 'Records', link: '/records/' },
						{ label: 'Validation rules', link: '/validation/' },
					],
				},
				{
					label: 'System',
					items: [
						{ label: 'Pull request checks', link: '/pull-request/' },
						{ label: 'DNS pipeline', link: '/dns-pipeline/' },
						{ label: 'Workflows', link: '/workflows/' },
						{ label: 'Watchers and scripts', link: '/operations/' },
					],
				},
				{
					label: 'Maintainers',
					items: [
						{ label: 'Adding a zone', link: '/zones/' },
						{ label: 'Name policy and rules', link: '/policy/' },
					],
				},
				{
					label: 'Fixing problems',
					items: [{ label: 'Troubleshooting', link: '/troubleshooting/' }],
				},
			],
		}),
	],
});
