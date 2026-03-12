export const DOT_TOS_URL = 'https://danceoftal.com/tos'

export function confirmDotTerms(action: 'login' | 'publish') {
    const verb = action === 'login' ? 'signing in' : 'publishing'
    return window.confirm(
        `By ${verb}, you agree to the Dance of Tal Terms of Service.\n\n${DOT_TOS_URL}\n\nContinue?`,
    )
}
