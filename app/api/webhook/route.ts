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

    // Lấy mã từ trường code hoặc trích xuất từ content
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

    // Xử lý thông minh: Chuyển mã không gạch dưới từ bank (vd: DH2130) 
    // thành dạng có gạch dưới để khớp với DB (vd: DH_2130)
    const cleanCode = orderCode.replace('_', ''); // Đảm bảo sạch gạch dưới trước: DH2130
    const dbFormatCode = cleanCode.replace(/^([A-Za-z]+)(\d+)$/, '$1_$2'); // Chuyển thành: DH_2130

    console.log("🔍 Tìm kiếm trong cột content với định dạng DB:", dbFormatCode, "Số tiền:", transferAmount);

    // Truy vấn tìm đơn hàng có cột content chứa mã dạng "DH_2130" (hoặc quét cả dạng không gạch dưới đề phòng)
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .or(`content.ilike.%${dbFormatCode}%,content.ilike.%${cleanCode}%`)
      .limit(1);

    if (fetchError || !orders || orders.length === 0) {
      console.log("⚠️ Không tìm thấy đơn hàng nào có content chứa mã:", dbFormatCode);
      return NextResponse.json({ success: true, message: 'Order not found' }, { status: 200 });
    }

    const targetOrder = orders[0];
    console.log("✅ Đã tìm thấy đơn hàng:", targetOrder);

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

    console.log(`🎉 HOÀN TẤT! Đơn hàng ${targetOrder.id} đã được cập nhật thành công!`);

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
