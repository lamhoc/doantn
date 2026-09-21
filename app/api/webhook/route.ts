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

    const cleanCode = orderCode.replace('_', ''); // Ví dụ: DH5463
    const withUnderscore = cleanCode.replace('DH', 'DH_'); // Ví dụ: DH_5463

    console.log("🔍 Đang tìm đơn hàng trong DB với mã chuẩn:", cleanCode, "Số tiền:", transferAmount);

    // Truy vấn trực tiếp không ràng buộc status để check xem đơn có tồn tại không
    let targetOrder = null;

    // 1. Tìm theo ID chính xác
    let { data: orderById, error: err1 } = await supabase
      .from('orders')
      .select('*')
      .eq('id', cleanCode)
      .maybeSingle();

    if (orderById) {
      targetOrder = orderById;
      console.log("📌 Tìm thấy qua ID chính xác:", targetOrder);
    } else {
      // 2. Tìm theo ID có gạch dưới
      let { data: orderByIdUnder, error: err2 } = await supabase
        .from('orders')
        .select('*')
        .eq('id', withUnderscore)
        .maybeSingle();

      if (orderByIdUnder) {
        targetOrder = orderByIdUnder;
        console.log("📌 Tìm thấy qua ID có gạch dưới:", targetOrder);
      } else {
        // 3. Tìm gần đúng trong cột content
        let { data: orderByContent, error: err3 } = await supabase
          .from('orders')
          .select('*')
          .ilike('content', `%${cleanCode}%`)
          .limit(1);

        if (orderByContent && orderByContent.length > 0) {
          targetOrder = orderByContent[0];
          console.log("📌 Tìm thấy qua cột content:", targetOrder);
        } else {
          console.log("❌ Supabase trả về lỗi (nếu có):", { err1, err2, err3 });
        }
      }
    }

    if (!targetOrder) {
      console.log("⚠️ Tuyệt đối không tìm thấy đơn hàng nào khớp với mã:", cleanCode, "trong bảng orders!");
      return NextResponse.json({ success: true, message: 'Order not found' }, { status: 200 });
    }

    console.log("✅ Đã chốt đơn hàng ID:", targetOrder.id, "| Trạng thái hiện tại:", targetOrder.status);

    // Kiểm tra số tiền thanh toán
    if (Number(transferAmount) < Number(targetOrder.total_amount)) {
      console.log(`⚠️ Số tiền chuyển (${transferAmount}) nhỏ hơn tổng đơn (${targetOrder.total_amount})`);
      return NextResponse.json({ success: true, message: 'Insufficient amount' }, { status: 200 });
    }

    // Cập nhật trạng thái đơn hàng thành 'paid'
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

    console.log(`🎉 HOÀN TẤT! Đơn hàng ${targetOrder.id} đã được cập nhật thành PAID!`);

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
