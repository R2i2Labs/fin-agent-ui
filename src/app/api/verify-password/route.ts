export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { password } = data;
    
    const correctPassword = process.env.PASSWORD;
    
    if (password === correctPassword) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ success: false, message: "Incorrect password" }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Server error" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}