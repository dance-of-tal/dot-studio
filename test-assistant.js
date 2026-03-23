// node test-assistant.js
async function run() {
  const headers = {
    'Content-Type': 'application/json',
    'x-working-dir': '/Users/junhoyoon/windsurfpjt/dance-of-tal/studio'
  }
  
  // 1. Create Session
  const createRes = await fetch('http://localhost:3000/api/chat/sessions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      performerId: 'studio-assistant',
      actId: null,
      title: 'API Test'
    })
  });
  if (!createRes.ok) {
    console.error('Session create failed:', await createRes.text());
    return;
  }
  const session = await createRes.json();
  const sessionId = session.id;
  console.log('Created session:', sessionId);

  // 2. Send Message
  const sendRes = await fetch(`http://localhost:3000/api/chat/sessions/${sessionId}/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: '안녕? 캔버스에 "TestDev"라는 이름의 Performer 하나 만들어줄래?',
      mode: 'primary'
    })
  });
  if (!sendRes.ok) {
    console.error('Send message failed:', await sendRes.text());
    return;
  }
  const result = await sendRes.json();
  console.log('Send result:', result);
}
run();
