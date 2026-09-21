import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("🔥 ĐÃ NHẬN WEBHOOK TỪ SEPAY:", JSON.stringify(body));

    // Lấy trực tiếp trường code từ Sepay (vd: "DH9138") và số tiền transferAmount
    let orderCode = body.code || '';
    const rawContent = body.content || body.description || '';
    const transferAmount = body.transferAmount || body.amountIn || 0;

    if (!orderCode && rawContent) {
      const match = rawContent.match(/DH[_]?\d+/i);
      if (match) {
        orderCode = match[0];
      }
    }

    if (!orderCode) {
      console.log("⚠️ Không tìm thấy mã đơn hàng trong payload!");
      return NextResponse.json({ success: true, message: 'Invalid order format' }, { status: 200 });
    }

    const cleanCode = orderCode.replace('_', ''); // Ví dụ: DH9138
    const withUnderscore = cleanCode.replace('DH', 'DH_'); // Ví dụ: DH_9138

    console.log("🔍 Đang tìm đơn hàng trong DB với các mã:", cleanCode, "hoặc", withUnderscore, "Số tiền:", transferAmount);

    let targetOrder = null;

    // 1. Tìm theo ID chính xác (dạng DH9138)
    let { data: orderById } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .eq('id', cleanCode)
      .maybeSingle();

    if (orderById) {
      targetOrder = orderById;
    } else {
      // 2. Thử tìm ID dạng có gạch dưới (DH_9138)
      let { data: orderByIdUnderscore } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'pending')
        .eq('id', withUnderscore)
        .maybeSingle();
      
      if (orderByIdUnderscore) {
        targetOrder = orderByIdUnderscore;
      } else {
        // 3. Tìm trong nội dung cột content
        let { data: orderByContent } = await supabase
          .from('orders')
          .select('*')
          .eq('status', 'pending')
          .ilike('content', `%${cleanCode}%`)
          .limit(1);

        if (orderByContent && orderByContent.length > 0) {
          targetOrder = orderByContent[0];
        }
      }
    }

    if (!targetOrder) {
      console.log("⚠️ Vẫn không tìm thấy đơn hàng khớp trong DB!");
      return NextResponse.json({ success: true, message: 'Order not found' }, { status: 200 });
    }

    console.log("✅ Đã tìm thấy đơn hàng:", targetOrder.id);

    // Kiểm tra số tiền thanh toán dựa trên transferAmount
    if (Number(transferAmount) < Number(targetOrder.total_amount)) {
      console.log(`⚠️ Số tiền chuyển (${transferAmount}) nhỏ hơn tổng đơn (${targetOrder.total_amount})`);
      return NextResponse.json({ success: true, message: 'Insufficient amount' }, { status: 200 });
    }

    // Cập nhật trạng thái đơn hàng thành 'paid' trong Supabase
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

    console.log(`✅ Đơn hàng ${targetOrder.id} đã thanh toán thành công qua Sepay!`);

    return NextResponse.json({ 
      success: true, 
      message: 'Success',
      orderId: targetOrder.id 
    }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Lỗi xử lý Webhook Sepay:', error.message);
    return NextResponse.json({ success: true, message: error.message }, { status: 200 });
  }
}
