console.log("Welcome: to proceed");


var selectedFile;

document.getElementById("input").addEventListener("change", (event) => {
    selectedFile = event.target.files[event.target.files.length - 1];
    console.log(selectedFile);
})

document.getElementById("upload").addEventListener("click", () => {

    if (selectedFile != undefined) {
        try {
            const fileReader = new FileReader();
            fileReader.readAsArrayBuffer(selectedFile);
            fileReader.onload = (event) => {
                const buffer = event.target.result;
                let data = new Uint8Array(buffer);
                let arr = new Array();
                for (var i = 0; i != data.length; ++i) arr[i] = String.fromCharCode(data[i]);
                var bstr = arr.join("");
                let workbook = XLSX.read(bstr, { type: "binary" });

                // let pickup_list = []
                // let dropoff_list = []
                let pickups = {}
                // let dropoffs = {}
                window.pickupCount = 0

                let check = false;
                workbook.SheetNames.forEach((sheet) => {
                    if (sheet.includes("Pick")) check = true;
                });

                if (!check) {
                    window.alert("Are you sure you used the correct file (⊙_⊙;)");
                    window.location.reload();
                } else {

                    workbook.SheetNames.forEach(sheet => {
                        let rowObject = XLS.utils.sheet_to_row_object_array(workbook.Sheets[sheet], { range: 2 });

                        if (sheet.includes("Pick")) {
                            let rowObject_sliced = Object.fromEntries(
                                Object.entries(rowObject).slice(0, Object.keys(rowObject).length - 1)
                            );
                            let temp = filterObj(rowObject_sliced);
                            if (temp != undefined) {
                                let refreshed_temp = keyRefresh(temp);
                                pickups = merge(pickups, refreshed_temp);
                            } else {
                                return 0;
                            }
                        }
                    });
                    let sorted_pickups = quickSort(pickups);

                    update_google_sheet(merge(sorted_pickups, { 1000: { Sort: true } }));
                }

            }
        } catch (err) {
            console.log("Error ==> ", err);
            window.alert("Are you sure you used the correct file (⊙_⊙;)");
            window.location.reload();
        }
    } else {
        window.alert("Select the file first! .....(╬▔皿▔)╯ (or just go to sheet)");
    }
})

const snip = (string, regexp, from = 0) => {
    const index = string.slice(from).search(regexp);
    if (index === -1) {
        return string;
    } else {
        return string.slice(0, index)
    }
}

const snipSnap = (string, regexp) => {
    return string.replace(new RegExp(regexp, 'gi'), '');
}

const partition = (obj, key_list, pivot) => {
    var pivot_value = obj[pivot]["Time"];
    var left = [];
    var right = [];

    key_list.forEach((key) => {
        if (key != pivot) {
            if (obj[key]["Time"] > pivot_value) {
                right.push(key);
            } else if (obj[key]["Time"] < pivot_value) {
                left.push(key);
            } else if (obj[key]["Res."] <= obj[pivot]["Res."]) {
                left.push(key);
            } else if (obj[key]["Res."] > obj[pivot]["Res."]) {
                right.push(key);
            }
        }
    });

    return [left, right];
}

const merge = (...objects) => {
    const deepCopyObjects = objects.map(object => JSON.parse(JSON.stringify(object)));
    return deepCopyObjects.reduce((merged, current) => ({ ...merged, ...current }), {});
}

const quickSort = (obj) => {
    let key_list = sort(obj, Object.keys(obj));
    let count = 0;
    let temp = {};
    key_list.forEach((key) => {
        temp[count] = obj[key];
        temp[count]["#"] = count + 1;
        count++;
    });

    return temp;
}

const sort = (obj, key_list) => {
    var len = key_list.length;

    if (len <= 1) { return key_list };

    var pivot = key_list[Math.floor(Math.random() * len)];

    var left = [];
    var right = [];

    [left, right] = partition(obj, key_list, pivot);


    let temp_left = sort(obj, left);
    let temp_right = sort(obj, right);

    let result = temp_left.concat([pivot], temp_right);

    return result;

}

const keyRefresh = (obj) => {
    let temp = {};
    Object.keys(obj).forEach((key) => {
        temp[window.pickupCount] = obj[key];
        window.pickupCount++;
    })

    return temp;
}

const idRefresh = (obj) => {
    let temp = {};
    let count = 1;
    Object.keys(obj).forEach((key) => {
        temp[count] = obj[key];
        temp[count]["#"] = count;
        count++;
    })

    return temp;
}

const filterObj = (sheet) => {
    if (sheet[0]["Res."] == undefined) {
        window.alert("Wrong file format mate ! （︶^︶）");
        window.location.reload();
        return undefined;
    }

    Object.keys(sheet).forEach((key) => {
        delete sheet[key]['#'];
        delete sheet[key]['# Days'];
        delete sheet[key]['Balance'];
        delete sheet[key]['Booked'];
        delete sheet[key]['Daily Rate'];
        delete sheet[key]['Day'];
        delete sheet[key]['Dropoff Date'];
        delete sheet[key]['Insurance'];
        delete sheet[key]['Rental Value'];
        delete sheet[key]['Checkin Completed'];
        delete sheet[key]['Pickup'];
        delete sheet[key]['Ref'];
        delete sheet[key]['Agent'];
        if (sheet[key]['Vehicle'] != undefined) {
            let rego = sheet[key]['Vehicle'];
            rego = snip(rego, "MEL");
            rego = snip(rego, "ADL");
            rego = snip(rego, "SYD");
            rego = snip(rego, "MSR");
            rego = snip(rego, "BNE");
            rego = snip(rego, "CNS");
            sheet[key]["Rego (ready)"] = rego;
            delete sheet[key]['Vehicle'];
        }
        if (sheet[key]['Agent'] != undefined) {
        }
        if (sheet[key]['Arrival'] != undefined && sheet[key]['Arrival'].includes("No. Travelling")) {
            sheet[key].Arrival = sheet[key].Arrival.slice(16);
        } else if (sheet[key]['Arrival'] != undefined && (sheet[key]['Arrival'].includes("N/A") || sheet[key]['Arrival'].includes("TBA"))) {
            sheet[key].Arrival = "";
        }
        if (sheet[key]["Items"] != undefined) {
            sheet[key]['Items / Notes'] = snipSnap(sheet[key]['Items'], "- Universal ").replace(/\)/g, ') ');
            delete sheet[key]['Items'];
        }
    });

    return sheet;
}

const scriptURL = 'https://script.google.com/macros/s/AKfycbzSxOtxn7jQHq8kk-rPtJvxdqFWR7X1Qf4Mj_X1MlohwwkOB0QTk7aHYwvuedua_9J9/exec';

update_google_sheet = (obj) => {

    let el = document.getElementById('loader');
    let percent = document.getElementById('loader-perct');
    el.style.display = "flex";
    Object.keys(obj).forEach((key, index) => {
        let form_data = new FormData();
        setTimeout(() => {
            Object.keys(obj[key]).forEach((el) => {
                form_data.append(el, obj[key][el]);
            });
            fetch(scriptURL, { method: 'POST', body: form_data })
                .catch(error => console.error('Error! o(TヘTo)', error.message));
            percent.innerHTML = Math.floor(index / Object.keys(obj).length * 100);
            if (Object.keys(obj).length - 1 == index) {
                el.style.display = "none";
                percent.innerHTML = "";
                window.alert("File submitted (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧");
                window.location.reload();
            }
        }, 2000 * index);

    });
}