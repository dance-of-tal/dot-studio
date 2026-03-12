import concurrently from 'concurrently';

async function main() {
    const commands: Array<{ command: string; name: string; prefixColor: string }> = [
        { command: 'npm run server:dev', name: 'server', prefixColor: 'blue' },
        { command: 'npm run dev', name: 'frontend', prefixColor: 'magenta' },
    ];

    const { result } = concurrently(commands, {
        prefix: 'name',
        killOthers: ['failure'],
        restartTries: 1,
    });

    try {
        await result;
    } catch (err) {
        console.error('One or more processes exited with an error');
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
