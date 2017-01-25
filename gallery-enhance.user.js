// ==UserScript==
// @name         Cinderella Girls gallery enhance
// @namespace    http://github.com/Yoctillion
// @version      1.3
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
    const resources = {
        "en": {
            buttonText:  "Save all images",
            downloading: "Downloading... {0}/{1}/{2}",
            packaing:    "Packaging...",
            finished:    "Finished",
            failed:      ", {0} failed"
        },
        "zh-CN": {
            buttonText:  "保存全部图片",
            downloading: "下载中…… {0}/{1}/{2}",
            packaing:    "打包中……",
            finished:    "已完成",
            failed:      "，其中 {0} 失败"
        }
    };

    let resource = resources[navigator.language];
    if (resource === undefined) resource = resources["en"];

    const ImageType = {
        large:    "l",
        m2:       "m2",
        xs:       "xs",
        quest:    "quest",
        noframe:  "l_noframe",
        premium:  "l_premium"
    };

    let cardNames = [];
    let idolName;


    String.prototype.format = function() {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function(match, number) { 
            return args[number] !== undefined
                ? args[number]
                : match;
        });
    };

    function updateIdol(idol) {
        let images = idol.images;
        for (let i = 0; i < idol.detail_list.length; i++) {
            let detail = unsafeWindow.idol.detail_list[i];
            cardNames[i] = detail.data.card_name;
            detail.is_exist_archive = true;
            detail.archive.normal = "1";

            let rarity = parseInt(detail.data.rarity);

            let card = new Card(detail.data.hash_card_id);
            if (rarity >= 5) { // SR / SR+
                detail.show_card_type = "l";
                detail.archive.premium = "1";

                // no way to get sign id

                if (!images.l[i])          images.l[i]          = card.getSignUrl(ImageType.large);
                if (!images.l_premium[i])  images.l_premium[i]  = card.getPremiumUrl(ImageType.large);
                if (!images.l_nosign[i])   images.l_nosign[i]   = card.getNoSignUrl(ImageType.large);
                if (!images.l_nosign_p[i]) images.l_nosign_p[i] = card.getNoSignPremiumUrl(ImageType.large);
                if (!images.l_noframe[i])  images.l_noframe[i]  = card.getLargeNoFrameUrl();
            } else {    // N / N+ / R / R+
                if (!images.l[i]) images.l[i] = card.getCardUrl(ImageType.large);
            }
            if (!images.m2[i])    images.m2[i]    = card.getCardUrl(ImageType.m2);
            if (!images.quest[i]) images.quest[i] = card.getCardUrl(ImageType.quest);
        }
    }

    class Card {
        constructor(hashId) {
            this.baseUrl = "http://sp.pf-img-a.mbga.jp/12008305/?guid=ON&amp;url=http%3A%2F%2F125.6.169.35%2Fidolmaster%2F";
            this.hashId  = hashId;
        }

        getCardUrl(size) {
            return this.getNoSignUrl(size);
        }

        getSignUrl(size) {
            return this.getImageUrl("card_sign_b", size);
        }

        getNoSignUrl(size) {
            return this.getImageUrl("card", size);
        }

        getPremiumUrl(size) {
            return this.getImageUrl("card_sign_p", size);
        }

        getNoSignPremiumUrl(size) {
            return this.getImageUrl("card_sign_no_p", size);
        }

        getLargeNoFrameUrl() {
            return this.getImageUrl("card", "l_noframe");
        }

        getImageUrl(type, size) {
            return this.baseUrl + "image_sp%2F" + type + "%2F" + size + "%2F" + this.hashId + ".jpg";
            // no way to get version
        }

        getSignJSUrl(id) {
            return baseUrl + "js%2Fcjs%2Fpremium%2Fsign_effect_" + id + ".js";
            // no way to get version
        }
    }

    // manage tasks
    // ugly and unstable
    class Task {
        constructor() {
            this.completed = false;
            this.tasks = [];
            this.parent = null;
            this.onCompleted = null;
        }

        complete() {
            if (this.tasks.length === 0) {
                this.completed = true;
            }

            if (this.parent) {
                this.parent.notify(this);
            }
        }

        isCompleted() {
            if (this.tasks.length === 0) {
                return this.completed;
            }

            for (let t of this.tasks) {
                if (!t.isCompleted()) {
                    return false;
                }
            }
            return true;
        }

        wait(task) {
            task.parent = this;
            this.tasks.push(task);
        }

        notify(task) {
            if (this.isCompleted()) {
                if (this.onCompleted) {
                    this.onCompleted();
                }
                this.complete();
            }
        }
    }

    function download(zip, url, path, counter) {
        let task = new Task();

        GM_xmlhttpRequest({
            method:       "GET",
            url:          url,
            responseType: "blob",
            onload:
            resp => {
                if (resp.status === 200) {
                    zip.file(path, resp.response, {binary: true});
                    console.log(path + " completed");
                    counter.success += 1;
                }
                else {
                    console.log(path + " fail: " + url + " " + resp.status + " " + resp.statusText);
                    counter.fail += 1;
                }

                task.complete();
                counter.update();
            }
        });
        return task;
    }

    function downloadAll(zip, urls, folder, counter, cardNames) {
        let task = new Task();
        let indexes = Object.keys(urls);
        for (let i of indexes) {
            if (urls[i]) {
                task.wait(download(zip, urls[i], folder + "/" + cardNames[i] + ".jpg", counter));
            }
        }
        return task;
    }

    function insertAfter(newNode, referenceNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    }

    function count(arr) {
        let result = 0;
        for (let x of arr) {
            if (x) {
                result++;
            }
        }
        return result;
    }

    let idol    = unsafeWindow.idol;

    let images  = idol.images;
    let large   = images[ImageType.large];
    let premium = images[ImageType.premium];
    let noframe = images[ImageType.noframe];

    idolName  = idol.detail_list[0].data.real_name;

    // remove class
    const notExistClass = "not_exist";
    let not_exists = document.getElementsByClassName(notExistClass);
    while(not_exists.length > 0) {
        not_exists[0].innerHTML = "";
        not_exists[0].classList.remove(notExistClass);
    }

    updateIdol(idol);

    // download button
    let btn = document.createElement("button");

    // style
    btn.className = "grayButton300";
    btn.setAttribute("style", "position: relative;");

    btn.innerHTML = resource.buttonText;

    btn.onclick = () => {
        class Counter {
            constructor() {
                this.success = 0;
                this.fail    = 0;
                this.total   = 0;
            }

            update() {
                btn.innerHTML = resource.downloading.format(this.success, this.fail, this.total);
            }
        }

        btn.disabled = true;

        let counter = new Counter();
        counter.total = count(large, "l") + count(premium, "p") + count(noframe, "n");
        counter.update();

        let zip = new JSZip();

        let task = new Task();
        task.wait(downloadAll(zip, large, "large", counter, cardNames));
        task.wait(downloadAll(zip, premium, "premium", counter, cardNames));
        task.wait(downloadAll(zip, noframe, "noframe", counter, cardNames));

        task.onCompleted = () => {
            btn.innerHTML = resource.packaing;

            zip.generateAsync({type:"blob"})
                .then(content => {
                    saveAs(content, idolName + ".zip");

                    btn.innerHTML = resource.finished + (counter.fail > 0 ? resource.failed.format(counter.fail) : "");

                    setTimeout(() => {
                        btn.disabled = false;
                        btn.innerHTML = resource.buttonText;
                    }, 3000);
                });
        };
    };

    let naviIcon = document.getElementsByClassName("icon_navi")[0];
    insertAfter(btn, naviIcon);
})();
