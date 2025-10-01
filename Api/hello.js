// นี่คือ Serverless Function ของเรา
// มันจะทำงานเมื่อมีคนเรียกมาที่ /api/hello

export default function handler(request, response) {
  // ส่งคำตอบกลับไปเป็น JSON
  response.status(200).json({
    message: "Hello from Vercel! Your API is working.",
    timestamp: new Date().toISOString()
  })
}