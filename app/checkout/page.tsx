'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function CheckoutPage() {
  const [loading, setLoading] = useState(false);
  const [orderInfo, setOrderInfo] = useState<{
    orderId: string;
    amount: number;
    content: string;
    qrUrl: string;
    status: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  const BANK_ID = 'MB';
  const ACCOUNT_NO = '0969654011';
  const ACCOUNT_NAME = 'LAM THAI HOC';

  // Lắng nghe thay đổi realtime từ Supabase cho đơn hàng hiện tại
  useEffect(() => {
    if (!orderInfo?.orderId) return;

    const channel = supabase
      .channel(`order_${orderInfo.orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderInfo.orderId}`,
        },
        (payload: any) => {
          console.log('🔥 Nhận tín hiệu cập nhật đơn hàng:', payload);
          if (payload.new && payload.new.status) {
            setOrderInfo((prev) => (prev ? { ...prev, status: payload.new.status } : null));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderInfo?.orderId]);

  const handleCreateOrder = async () => {
    setLoading(true);
    const amount = 75000;
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const content = `DH_${randomCode}`;

    const { data, error } = await supabase
      .from('orders')
      .insert([{ total_amount: amount, content: content, status: 'pending' }])
      .select()
      .single();

    if (error) {
      console.error('Lỗi tạo đơn:', error);
      alert('Không thể tạo đơn hàng lên Supabase!');
      setLoading(false);
      return;
    }

    // Đã sửa lại đúng tên hằng số ACCOUNT_NO
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?amount=${amount}&addInfo=${content}&accountName=${ACCOUNT_NAME}`;

    setOrderInfo({
      orderId: data.id,
      amount,
      content,
      qrUrl,
      status: 'pending',
    });
    setLoading(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-6 rounded-2xl shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          ☕ Thanh Toán Đơn Hàng F&B
        </h1>

        {!orderInfo ? (
          <div className="text-center">
            <p className="text-gray-600 mb-4">Tổng tiền cần thanh toán: <strong className="text-xl text-orange-600">75,000 đ</strong></p>
            <button
              onClick={handleCreateOrder}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-xl transition duration-200"
            >
              {loading ? 'Đang tạo mã thanh toán...' : 'Tạo Mã QR Thanh Toán'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Hiển thị trạng thái động dựa vào orderInfo.status */}
            {orderInfo.status === 'paid' ? (
              <div className="bg-green-50 border border-green-200 p-4 rounded-xl text-center space-y-2">
                <div className="text-3xl">✅</div>
                <h2 className="text-lg font-bold text-green-700">Thanh toán thành công!</h2>
                <p className="text-sm text-green-600">Hệ thống đã nhận được tiền. Đang chuẩn bị món cho bạn...</p>
              </div>
            ) : (
              <>
                <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-center text-sm text-orange-800">
                  Mã đơn hàng: <b>{orderInfo.content}</b> — Trạng thái: <span className="text-yellow-600 font-bold animate-pulse">Chờ thanh toán...</span>
                </div>

                <div className="flex justify-center bg-white p-2 border rounded-xl">
                  <img src={orderInfo.qrUrl} alt="VietQR Thanh Toán" className="w-64 h-64 object-contain" />
                </div>
              </>
            )}

            <div className="bg-gray-100 p-4 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Ngân hàng:</span>
                <span className="font-bold">MB Bank (Quân Đội)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Số tài khoản:</span>
                <div className="flex items-center space-x-2">
                  <span className="font-bold font-mono">{ACCOUNT_NO}</span>
                  <button onClick={() => handleCopy(ACCOUNT_NO)} className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded">
                    Copy
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Chủ tài khoản:</span>
                <span className="font-bold">{ACCOUNT_NAME}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Số tiền:</span>
                <span className="font-bold text-orange-600">{orderInfo.amount.toLocaleString()} đ</span>
              </div>
              <div className="flex justify-between items-center border-t pt-2">
                <span className="text-gray-600">Nội dung (Bắt buộc):</span>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-red-600 font-mono">{orderInfo.content}</span>
                  <button onClick={() => handleCopy(orderInfo.content)} className="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded font-semibold">
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {copied && <p className="text-center text-xs text-green-600 font-medium">Đã sao chép vào bộ nhớ tạm!</p>}
          </div>
        )}
      </div>
    </div>
  );
}
