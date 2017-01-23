// ==UserScript==
// @name         Cinderella Girls gallery enhance
// @namespace    http://github.com/Yoctillion
// @version      1.1
// @author       Yoctillion
// @description  Unlock cards and download
// @include      http://sp.pf.mbga.jp/12008305/?guid=ON&*url=http%3A%2F%2F125.6.169.35%2Fidolmaster%2Fidol_gallery%2Fidol_detail%2F*
// @require      https://raw.githubusercontent.com/Stuk/jszip/master/dist/jszip.min.js
// @require      https://raw.githubusercontent.com/eligrey/FileSaver.js/master/FileSaver.min.js
// @updateURL    https://raw.githubusercontent.com/Yoctillion/CinderellaGirlsGalleryEnhance/master/gallery-enhance.user.js
// @downloadURL  https://raw.githubusercontent.com/Yoctillion/CinderellaGirlsGalleryEnhance/master/gallery-enhance.user.js
// @license      https://github.com/Yoctillion/CinderellaGirlsGalleryEnhance/blob/master/LICENSE
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    const baseUrl = "http://sp.pf-img-a.mbga.jp/12008305/?guid=ON&amp;url=http%3A%2F%2F125.6.169.35%2Fidolmaster%2F";

    const large = "l";
    const m2 = "m2";
    const xs = "xs";
    const quest = "quest";

    let cardNames = [];
    let idolName;

    function updateIdol(idol) {
        let images = idol.images;
        for (let i = 0; i < idol.detail_list.length; i++) {
            let detail = unsafeWindow.idol.detail_list[i];
            cardNames[i] = detail.data.card_name;
            detail.is_exist_archive = true;
            detail.archive.normal = "1";

            let hashId = detail.data.hash_card_id;
            let rarity = parseInt(detail.data.rarity);
            if (rarity >= 5) { // SR / SR+
                detail.show_card_type = "l";
                detail.archive.premium = "1";

                // no way to get sign id

                if (!images.l[i])          images.l[i]          = getSignUrl(large, hashId);
                if (!images.l_premium[i])  images.l_premium[i]  = getPremiumUrl(large, hashId);
                if (!images.l_nosign[i])   images.l_nosign[i]   = getNoSignUrl(large, hashId);
                if (!images.l_nosign_p[i]) images.l_nosign_p[i] = getNoSignPremiumUrl(large, hashId);
                if (!images.l_noframe[i])  images.l_noframe[i]  = getLargeNoFrameUrl(hashId);
            } else {    // N / N+ / R / R+
                if (!images.l[i]) images.l[i] = getCardUrl(large, hashId);
            }
            if (!images.m2[i])    images.m2[i]    = getCardUrl(m2, hashId);
            if (!images.quest[i]) images.quest[i] = getCardUrl(quest, hashId);
        }
    }

    function getCardUrl(size, hashId) {
        return getNoSignUrl(size, hashId);
    }

    function getSignUrl(size, hashId) {
        return getImageUrl("card_sign_b", size, hashId);
    }

    function getNoSignUrl(size, hashId) {
        return getImageUrl("card", size, hashId);
    }

    function getPremiumUrl(size, hashId) {
        return getImageUrl("card_sign_p", size, hashId);
    }

    function getNoSignPremiumUrl(size, hashId) {
        return getImageUrl("card_sign_no_p", size, hashId);
    }

    function getLargeNoFrameUrl(hashId) {
        return getImageUrl("card", "l_noframe", hashId);
    }

    function getImageUrl(type, size, hashId) {
        return baseUrl + "image_sp%2F" + type + "%2F" + size + "%2F" + hashId + ".jpg";
        // no way to get version
    }

    function getSignJSUrl(id) {
        return baseUrl + "js%2Fcjs%2Fpremium%2Fsign_effect_" + id + ".js";
        // no way to get version
    }

    // manage tasks
    // ugly and unstable
    function Task() {
        this.completed = false;
        this.tasks = [];
        this.parent = null;
        this.onCompleted = null;

        this.complete = function() {
            if (this.tasks.length === 0) {
                this.completed = true;
            }

            if (this.parent) {
                this.parent.notify(this);
            }
        };

        this.isCompleted = function() {
            if (this.tasks.length === 0) {
                return this.completed;
            }

            for (let t of this.tasks) {
                if (!t.isCompleted()) {
                    return false;
                }
            }
            return true;
        };

        this.wait = function(task) {
            task.parent = this;
            this.tasks.push(task);
        };

        this.notify = function(task) {
            if (this.isCompleted()) {
                if (this.onCompleted) {
                    this.onCompleted();
                }
                this.complete();
            }
        };
    }

    function download(zip, url, path) {
        let task = new Task();

        GM_xmlhttpRequest({
            method:       "GET",
            url:          url,
            responseType: "blob",
            onload:
            function(resp) {
                if (resp.status === 200) {
                    zip.file(path, resp.response, {binary: true});
                    console.log(path + " completed");
                }
                else {
                    console.log(path + " fail: " + url + " " + resp.status + " " + resp.statusText);
                }

                task.complete();
            }
        });
        return task;
    }

    function downloadAll(zip, urls, folder) {
        let task = new Task();
        let indexes = Object.keys(urls);
        for (let i of indexes) {
            if (urls[i]) {
                task.wait(download(zip, urls[i], folder + "/" + cardNames[i] + ".jpg"));
            }
        }
        return task;
    }

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    const notExistClass = "not_exist";
    let not_exists = document.getElementsByClassName(notExistClass);
    while(not_exists.length > 0) {
        not_exists[0].innerHTML = "";
        not_exists[0].classList.remove(notExistClass);
    }

    let idol = unsafeWindow.idol;

    idolName = idol.detail_list[0].data.real_name;

    // unlock gallery
    updateIdol(idol);

    // download button
    let btn = document.createElement("button");

    // style
    btn.className = "grayButton300";
    btn.setAttribute("style", "position: relative;");

    btn.innerHTML = "Save all images";

    btn.onclick = function() {
        btn.disabled = true;
        btn.innerHTML = "Downloading...";

        let images = idol.images;

        let zip = new JSZip();

        let task = new Task();
        task.wait(downloadAll(zip, images.l, "large"));
        task.wait(downloadAll(zip, images.l_premium, "premium"));
        task.wait(downloadAll(zip, images.l_noframe, "noframe"));

        task.onCompleted = function() {
            btn.innerHTML = "Packaging...";

            zip.generateAsync({type:"blob"})
                .then(
                function(content) {
                    saveAs(content, idolName + ".zip");
                }
            );

            btn.innerHTML = "Finished";

            setTimeout(function() {
                btn.disabled = false;
                btn.innerHTML = "Save all images";
            }, 3000);
        };
    };

    let naviIcon = document.getElementsByClassName("icon_navi")[0];
    insertAfter(btn, naviIcon);
})();
