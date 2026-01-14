/**
 * PTIT Schedule Exporter
 *
 * Hướng dẫn sử dụng:
 * 1. Đăng nhập vào https://qldt.ptit.edu.vn
 * 2. Mở Developer Console (F12 hoặc click chuột phải -> Inspect -> Console)
 * 3. Copy toàn bộ code bên dưới và paste vào Console -> Enter
 * 4. Chờ một chút, file .ics sẽ tự động tải xuống.
 */

(async () => {
    // --- CẤU HÌNH ---
    const CONFIG = {
        API_URL: "https://qldt.ptit.edu.vn/dkmh/api/sch/w-locdstkbtuanusertheohocky",
        PERIOD_DURATION: 45, // Phút
        // Thời gian bắt đầu của từng tiết (Giờ:Phút)
        // Lưu ý: Tiết 7 bắt đầu từ 13h00 theo yêu cầu. Các tiết khác ước tính dựa trên 45p + giải lao.
        START_TIMES: {
            // Sáng: Bắt đầu 7h, mỗi tiết cách nhau 1 tiếng
            1: { h: 7, m: 0 },
            2: { h: 8, m: 0 },
            3: { h: 9, m: 0 },
            4: { h: 10, m: 0 },
            5: { h: 11, m: 0 },
            6: { h: 12, m: 0 },

            // Chiều: Bắt đầu 13h, mỗi tiết cách nhau 1 tiếng
            7: { h: 13, m: 0 },
            8: { h: 14, m: 0 },
            9: { h: 15, m: 0 },
            10: { h: 16, m: 0 },
            11: { h: 17, m: 0 },
            12: { h: 18, m: 0 },
        },
    };

    // --- HÀM TIỆN ÍCH ---

    function getToken() {
        const userStr = sessionStorage.getItem("CURRENT_USER");
        if (!userStr) {
            throw new Error("Không tìm thấy thông tin đăng nhập! Vui lòng đăng nhập qldt.ptit.edu.vn trước.");
        }
        try {
            const user = JSON.parse(userStr);
            // Cấu trúc thường thấy: { access_token: "...", ... } hoặc user là token string
            // Dựa trên response header 'Bearer ...', ta cần token string raw.
            // Nếu user là object, lấy access_token, nếu không trả về chính nó.
            return user.access_token || user;
        } catch (e) {
            console.warn("Không parse được JSON user, thử dùng trực tiếp chuỗi...");
            return userStr;
        }
    }

    function formatICSDate(dateStr, timeObj = { h: 0, m: 0 }) {
        // dateStr: "2026-01-12T00:00:00" -> Đối tượng Date
        const d = new Date(dateStr);
        d.setHours(timeObj.h);
        d.setMinutes(timeObj.m);

        // Định dạng: YYYYMMDDTHHmmSS
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hour = String(d.getHours()).padStart(2, "0");
        const minute = String(d.getMinutes()).padStart(2, "0");
        const second = String(d.getSeconds()).padStart(2, "0");

        return `${year}${month}${day}T${hour}${minute}${second}`;
    }

    function getEndTime(startTimeObj, periods) {
        // Tính thời gian kết thúc dựa trên số tiết
        // Đơn giản hóa: StartTime + (45 * periods) + (15 * (periods - 1)) nghỉ giữa giờ

        const startTotalMinutes = startTimeObj.h * 60 + startTimeObj.m;
        // Mỗi tiết 45p, nghỉ 15p
        const durationMinutes = periods * 45 + (periods - 1) * 15;

        const endTotalMinutes = startTotalMinutes + durationMinutes;

        const endH = Math.floor(endTotalMinutes / 60);
        const endM = endTotalMinutes % 60;

        return { h: endH, m: endM };
    }

    // --- LOGIC CHÍNH ---

    try {
        console.log("Đang khởi động...");
        const token = getToken();

        // 1. Lấy thông tin học kỳ hiện tại (đoán hoặc lấy mặc định cấu hình)
        // Để an toàn, thử gửi request lấy lịch với param rỗng hoặc hardcode theo dữ liệu mẫu user đưa
        // Request mẫu user cung cấp: "nhhk": 20252 -> Có thể là năm học 2025-2026, HK 2
        // Thử request default để API tự trả về kỳ hiện tại, hoặc hardcode nếu cần thiết.

        console.log("Đang tải dữ liệu lịch học...");
        const response = await fetch(CONFIG.API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            // Dựa trên lỗi "NullReferenceException", có thể server cần tham số chính xác hoặc không cần tham số nào (lấy mặc định).
            // Thử gửi payload rỗng để server tự fill context.
            body: JSON.stringify({
                filter: {
                    hoc_ky: 20252,
                    ten_hoc_ky: "",
                },
                additional: {
                    paging: {
                        limit: 100,
                        page: 1,
                    },
                    ordering: [
                        {
                            name: null,
                            order_type: null,
                        },
                    ],
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Lỗi API: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();

        if (!json.data || !json.data.ds_tuan_tkb) {
            console.error("Cấu trúc JSON nhận được không đúng:", json);
            // Thử đoán xem lỗi gì
            let msg = "Dữ liệu trả về không đúng cấu trúc mong đợi.";
            if (json.meta && json.meta.message) {
                msg += ` Server nhắn: ${json.meta.message}`;
            }
            throw new Error(msg + " (Xem chi tiết trong Console)");
        }

        console.log(`Tìm thấy ${json.data.ds_tuan_tkb.length} tuần học.`);

        // 2. Xử lý dữ liệu sang ICS format
        let icsContent = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PTIT Schedule Exporter//Unisch//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

        let eventCount = 0;

        json.data.ds_tuan_tkb.forEach((tuan) => {
            tuan.ds_thoi_khoa_bieu.forEach((buoi) => {
                // Bỏ qua nếu là ngày nghỉ
                if (buoi.is_nghi_day) return;

                const monHoc = buoi.ten_mon;
                const giangVien = buoi.ten_giang_vien;
                const phong = buoi.ma_phong;
                const lop = buoi.ma_lop; // D22HTTT05
                const ngayHocStr = buoi.ngay_hoc; // 2026-01-12T00:00:00
                const tietBatDau = buoi.tiet_bat_dau;
                const soTiet = buoi.so_tiet;

                // Quy đổi tiết sang giờ
                const timeStart = CONFIG.START_TIMES[tietBatDau];
                if (!timeStart) {
                    console.warn(`Không rõ giờ bắt đầu cho tiết ${tietBatDau} của môn ${monHoc}. Bỏ qua.`);
                    return;
                }

                const timeEnd = getEndTime(timeStart, soTiet);

                const dtStart = formatICSDate(ngayHocStr, timeStart);
                const dtEnd = formatICSDate(ngayHocStr, timeEnd);

                const summary = `${monHoc} (Tiết ${tietBatDau}-${tietBatDau + soTiet - 1})`;
                const description = `Giảng viên: ${giangVien}\\nLớp: ${lop}\\nTiết: ${tietBatDau} - ${tietBatDau + soTiet - 1}`;
                const location = phong;

                // Tạo event block
                icsContent.push("BEGIN:VEVENT");
                icsContent.push(`UID:${buoi.id_tkb}-${buoi.ngay_hoc}@ptit.edu.vn`);
                icsContent.push(`DTSTAMP:${formatICSDate(new Date().toISOString())}`); // Thời điểm tạo
                icsContent.push(`DTSTART:${dtStart}`);
                icsContent.push(`DTEND:${dtEnd}`);
                icsContent.push(`SUMMARY:${summary}`);
                icsContent.push(`DESCRIPTION:${description}`);
                icsContent.push(`LOCATION:${location}`);
                icsContent.push("END:VEVENT");

                eventCount++;
            });
        });

        icsContent.push("END:VCALENDAR");

        // 3. Tải file
        if (eventCount === 0) {
            alert("Không tìm thấy lịch học nào để xuất!");
            return;
        }

        const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `TKB_PTIT_${new Date().toISOString().slice(0, 10)}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log(`Đã xuất thành công ${eventCount} sự kiện lịch!`);
        alert(`Đã xuất thành công ${eventCount} buổi học ra file ICS. Hãy import vào Calendar nhé!`);
    } catch (err) {
        console.error("Lỗi:", err);
        alert("Có lỗi xảy ra: " + err.message);
    }
})();
