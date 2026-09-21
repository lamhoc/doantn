import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("🔥 ĐÃ NHẬN WEBHOOK TỪ PAYOS:", JSON.stringify(body));

    const txData = body.data;
    if (!txData) {
      // Trả về 200 ngay lập tức cho các request test ping từ payOS
      return NextResponse.json({ success: true, message: 'Webhook received test' }, { status: 200 });
    }

    const rawContent = txData.description || String(txData.orderCode || '');
    const transferAmount = txData.amount || 0;

    const match = rawContent.match(/DH_\d+/i);
    const orderCode = match ? match[0] : rawContent.trim();

    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .or(`id.eq.${orderCode},content.ilike.%${orderCode}%`);

    if (fetchError || !orders || orders.length === 0) {
      console.log("⚠️ Không tìm thấy đơn hàng khớp với:", orderCode);
      return NextResponse.json({ success: true, message: 'Order not found' }, { status: 200 });
    }

    const targetOrder = orders[0];

    if (Number(transferAmount) < Number(targetOrder.total_amount)) {
      console.log(`⚠️ Số tiền chuyển nhỏ hơn tổng đơn`);
      return NextResponse.json({ success: true, message: 'Insufficient amount' }, { status: 200 });
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'paid', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', targetOrder.id);

    if (updateError) {
      console.error('❌ Lỗi update database:', updateError);
      return NextResponse.json({ success: true, message: 'Database error' }, { status: 200 });
    }

    console.log(`✅ Đơn hàng ${targetOrder.id} đã thanh toán thành công!`);

    return NextResponse.json({ 
      success: true, 
      message: 'Success',
      orderId: targetOrder.id 
    }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Lỗi xử lý Webhook:', error.message);
    // Luôn trả về 200 để tránh payOS báo lỗi 400/500
    return NextResponse.json({ success: true, message: error.message }, { status: 200 });
  }
}
