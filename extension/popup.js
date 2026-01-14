// Khi popup mở, tải danh sách học kỳ
document.addEventListener("DOMContentLoaded", async () => {
    const semesterSelect = document.getElementById("semesterSelect");
    const exportBtn = document.getElementById("exportBtn");
    const statusDiv = document.getElementById("status");

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url.includes("qldt.ptit.edu.vn")) {
            statusDiv.textContent = "Vui lòng mở trang qldt.ptit.edu.vn!";
            statusDiv.className = "error";
            return;
        }

        // Lấy danh sách học kỳ từ content script
        const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_SEMESTERS" });

        if (response && response.success) {
            const semesters = response.data.ds_hoc_ky;
            const currentSemester = response.data.hoc_ky_theo_ngay_hien_tai;

            // Populate dropdown
            semesterSelect.innerHTML = "";
            semesters.forEach((sem) => {
                const option = document.createElement("option");
                option.value = sem.hoc_ky;
                option.textContent = sem.ten_hoc_ky;
                if (sem.hoc_ky === currentSemester) {
                    option.selected = true;
                }
                semesterSelect.appendChild(option);
            });

            semesterSelect.disabled = false;
            exportBtn.disabled = false;
        } else {
            throw new Error(response ? response.message : "Không thể tải danh sách học kỳ");
        }
    } catch (err) {
        console.error(err);
        statusDiv.textContent = err.message || "Có lỗi xảy ra khi tải học kỳ";
        statusDiv.className = "error";
    }
});

// Xử lý nút Export
document.getElementById("exportBtn").addEventListener("click", async () => {
    const statusDiv = document.getElementById("status");
    const btn = document.getElementById("exportBtn");
    const shouldMerge = document.getElementById("mergeCheckbox").checked;
    const selectedSemester = parseInt(document.getElementById("semesterSelect").value);

    statusDiv.textContent = "Đang xử lý...";
    statusDiv.className = "";
    btn.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url.includes("qldt.ptit.edu.vn")) {
            throw new Error("Vui lòng mở trang qldt.ptit.edu.vn!");
        }

        // Gửi message xuống content script với option merge và học kỳ
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: "START_EXPORT",
            merge: shouldMerge,
            hoc_ky: selectedSemester,
        });

        if (response && response.success) {
            statusDiv.textContent = response.message;
            statusDiv.className = "success";
        } else {
            throw new Error(response ? response.message : "Lỗi không xác định");
        }
    } catch (err) {
        console.error(err);
        statusDiv.textContent = err.message || "Có lỗi xảy ra";
        statusDiv.className = "error";
    } finally {
        btn.disabled = false;
    }
});
