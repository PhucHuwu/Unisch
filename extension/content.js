// Content script listens for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_EXPORT") {
        exportSchedule()
            .then((msg) => {
                sendResponse({ success: true, message: msg });
            })
            .catch((err) => {
                sendResponse({ success: false, message: err.message });
            });
        return true; // Keep channel open for async response
    }
});

async function exportSchedule() {
    // --- CẤU HÌNH ---
    const CONFIG = {
        API_URL: "https://qldt.ptit.edu.vn/dkmh/api/sch/w-locdstkbtuanusertheohocky",
        PERIOD_DURATION: 45, // Phút
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

    // --- HELPER FUNCTIONS ---

    function getToken() {
        // Content script runs in the context of the page, so it can access sessionStorage
        const userStr = sessionStorage.getItem("CURRENT_USER");
        if (!userStr) {
            throw new Error("Không tìm thấy thông tin đăng nhập! Vui lòng đăng nhập qldt.ptit.edu.vn trước.");
        }
        try {
            const user = JSON.parse(userStr);
            return user.access_token || user;
        } catch (e) {
            console.warn("Không parse được JSON user, thử dùng trực tiếp chuỗi...");
            return userStr;
        }
    }

    function formatICSDate(dateStr, timeObj = { h: 0, m: 0 }) {
        const d = new Date(dateStr);
        d.setHours(timeObj.h);
        d.setMinutes(timeObj.m);

        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hour = String(d.getHours()).padStart(2, "0");
        const minute = String(d.getMinutes()).padStart(2, "0");
        const second = String(d.getSeconds()).padStart(2, "0");

        return `${year}${month}${day}T${hour}${minute}${second}`;
    }

    function getEndTime(startTimeObj, periods) {
        const startTotalMinutes = startTimeObj.h * 60 + startTimeObj.m;
        // Mỗi tiết 45p, nghỉ giữa các tiết 15p (vì mỗi tiết cách nhau 1 tiếng)
        // Tổng thời gian = (Số tiết * 45) + ((Số tiết - 1) * 15)
        const durationMinutes = periods * 45 + (periods - 1) * 15;
        const endTotalMinutes = startTotalMinutes + durationMinutes;

        const endH = Math.floor(endTotalMinutes / 60);
        const endM = endTotalMinutes % 60;

        return { h: endH, m: endM };
    }

    // --- MAIN LOGIC ---

    console.log("Đang khởi động quy trình xuất lịch...");
    const token = getToken();

    console.log("Đang tải dữ liệu lịch học...");
    const response = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
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
        let msg = "Dữ liệu trả về không đúng cấu trúc mong đợi.";
        if (json.meta && json.meta.message) {
            msg += ` Server nhắn: ${json.meta.message}`;
        }
        throw new Error(msg);
    }

    console.log(`Tìm thấy ${json.data.ds_tuan_tkb.length} tuần học.`);

    let icsContent = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PTIT Schedule Exporter//Unisch//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

    let eventCount = 0;

    json.data.ds_tuan_tkb.forEach((tuan) => {
        tuan.ds_thoi_khoa_bieu.forEach((buoi) => {
            if (buoi.is_nghi_day) return;

            const monHoc = buoi.ten_mon;
            const giangVien = buoi.ten_giang_vien;
            const phong = buoi.ma_phong;
            const lop = buoi.ma_lop;
            const ngayHocStr = buoi.ngay_hoc;
            const tietBatDau = buoi.tiet_bat_dau;
            const soTiet = buoi.so_tiet;

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

            icsContent.push("BEGIN:VEVENT");
            icsContent.push(`UID:${buoi.id_tkb}-${buoi.ngay_hoc}@ptit.edu.vn`);
            icsContent.push(`DTSTAMP:${formatICSDate(new Date().toISOString())}`);
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

    if (eventCount === 0) {
        throw new Error("Không tìm thấy lịch học nào để xuất!");
    }

    // Download file logic
    const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Create download link via message passing or just plain DOM since we are in content script?
    // Content script can create DOM elements.
    const a = document.createElement("a");
    a.href = url;
    a.download = `TKB_PTIT_${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Đã xuất thành công ${eventCount} sự kiện lịch!`);
    return `Đã xuất ${eventCount} buổi học thành công!`;
}
