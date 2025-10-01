// File: /api/submit-co2.js

// 1. Import Library ของ Supabase
import { createClient } from '@supabase/supabase-js';

// 2. สร้างการเชื่อมต่อกับ Supabase โดยใช้ค่าจาก Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  // 3. ป้องกันไม่ให้ Method อื่นนอกจาก POST เข้ามาได้
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 4. ดึงข้อมูลจาก Body ที่ ESP32 ส่งมา
    const { co2_position1_ppm, co2_position2_ppm, co2_position3_ppm } = request.body;

    // 5. ตรวจสอบข้อมูลเบื้องต้น
    if (co2_position1_ppm === undefined || co2_position3_ppm === undefined) {
      return response.status(400).json({ error: 'Missing required CO2 data' });
    }

    // 6. คำนวณค่า CO2 ที่ลดได้
    const co2_reduced_ppm_interval = co2_position1_ppm - co2_position3_ppm;

    // 7. บันทึกข้อมูลลงในตาราง co2_data
    const { data, error } = await supabase
      .from('co2_data')
      .insert([
        {
          co2_position1_ppm,
          co2_position2_ppm,
          co2_position3_ppm,
          co2_reduced_ppm_interval, // ใส่ค่าที่คำนวณได้ลงไปด้วย
        },
      ])
      .select();

    // 8. จัดการ Error หากบันทึกไม่สำเร็จ
    if (error) {
      console.error('Supabase error:', error);
      return response.status(500).json({ error: 'Failed to save data to Supabase' });
    }

    // 9. ส่งคำตอบกลับไปว่าสำเร็จ
    console.log('Successfully inserted CO2 data:', data);
    return response.status(200).json({ success: true, saved_data: data });

  } catch (err) {
    console.error('Server error:', err);
    return response.status(500).json({ error: 'Internal Server Error' });
  }
}