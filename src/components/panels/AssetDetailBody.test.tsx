import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AssetDetailBody from './AssetDetailBody'

describe('AssetDetailBody', () => {
    it('renders GitHub dance sync status and repo drift details', () => {
        const html = renderToStaticMarkup(
            <AssetDetailBody
                asset={{
                    kind: 'dance',
                    name: 'research-pack',
                    urn: 'dance/@acme/skill-pack/research-pack',
                    author: '@acme',
                    source: 'stage',
                    description: 'Research helpers',
                    github: {
                        source: 'github',
                        sourceUrl: 'https://github.com/acme/skill-pack',
                        ref: 'main',
                        repoRootSkillPath: 'skills/research-pack',
                        sync: {
                            state: 'repo_drift',
                            message: 'The source repo now exposes a different set of Dance skills.',
                            repoDrift: {
                                newSkills: [{
                                    name: 'interview-pack',
                                    urn: 'dance/@acme/skill-pack/interview-pack',
                                    repoRootSkillPath: 'skills/interview-pack',
                                }],
                                missingInstalledUrns: ['dance/@acme/skill-pack/research-pack'],
                            },
                        },
                    },
                }}
                loading={false}
                installed
            />,
        )

        expect(html).toContain('GitHub Source')
        expect(html).toContain('Status: Repo drift')
        expect(html).toContain('interview-pack')
        expect(html).toContain('research-pack')
    })
})
