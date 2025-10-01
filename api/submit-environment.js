// File: /api/submit-environment.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. ดึงข้อมูลจาก ESP32
    const { ph_wolffia, ph_shells, temp_solar_front, temp_solar_rear, voltage, current_ma, status } = request.body;

    // 2. ตรวจสอบข้อมูลเบื้องต้น
    if (voltage === undefined || current_ma === undefined) {
      return response.status(400).json({ error: 'Missing required voltage or current data' });
    }
    
    // 3. คำนวณค่า Power และ Energy
    const power_w = voltage * (current_ma / 1000);
    const energy_wh_interval = power_w * (10 / 60); // 10 นาที = 10/60 ชั่วโมง

    // 4. บันทึกข้อมูลลงในตาราง environment_data
    const { data, error } = await supabase
      .from('environment_data')
      .insert([
        {
          ph_wolffia,
          ph_shells,
          temp_solar_front,
          temp_solar_rear,
          voltage,
          current_ma,
          status,
          power_w, // ค่าที่คำนวณได้
          energy_wh_interval, // ค่าที่คำนวณได้
        },
      ])
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return response.status(500).json({ error: 'Failed to save data to Supabase' });
    }

    // 5. ส่งคำตอบกลับไปว่าสำเร็จ
    console.log('Successfully inserted environment data:', data);
    return response.status(200).json({ success: true, saved_data: data });

  } catch (err) {
    console.error('Server error:', err);
    return response.status(500).json({ error: 'Internal Server Error' });
  }
}