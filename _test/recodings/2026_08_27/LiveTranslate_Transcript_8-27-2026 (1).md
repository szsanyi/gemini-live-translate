# LIVETRANSLATE TRANSCRIPT

_Recorded: 8/27/2026, 3:57:07 PM_

### [1] · 3:57:07 PM

- **EN:** better style though
- **HU:** Jobb stílus viszont

---

### [2] · 3:57:21 PM

- **EN:** . Yeah, I was curious if we're at the point that we could just uh jump into CAD and point to the two customization files and say, "Hey, here. Make me a part for this." How close could it get?
- **HU:** . Igen, arra voltam kíváncsi, hogy eljutottunk-e már arra a pontra, hogy csak úgy, ööö, beugorhatunk a CAD-be, rámutathatunk a két testreszabási fájlra, és azt mondhatjuk: „Figyelj, itt van. Csinálj nekem erre egy alkatrészt.” Milyen közel kerülhetne ehhez?

---

### [3] · 3:59:08 PM

- **EN:** Uh that's that's pretty much what I've been been testing and it it gets pretty pretty good. It It's It's like a give and take, right? I pretty much went through just handing it the uh file path. And I pretty much knew where it was already, but I just sent it a screenshot of like where it the UI currently looks and then what I want it to be. And it It was pretty close. I had to go through a couple of iterations of just telling it to rearrange stuff, but it definitely really helped that you uh added the uh feature keys inside of the UI. And Oh, yeah. Well, that was the whole point. If uh if I was going to dump it into uh CAD uh that was that was the easiest way to map it. Yeah. Yeah. So, yeah. It's It's pretty good. It It did the the mapping perfect. Um and then it just like kind of had rows in kind of weird spots and I had to just keep shouting at it until it Yeah. uh had things in the right place. Now, of course, I didn't specify between the the date fields and the other ones and the text edits, so I'm sure that uh screwed up uh the time one, but uh yeah. No. No. It's uh because I have the um master data XML in the the code base and I've been yelling at it to to check at that. Um it's It was It got it all right. Oh, I didn't mean to do that cuz I was doing something the other day and uh Code was complaining that, "Oh, well, that's not in your master data XML." I was like, "Oh, dude, that's That's just the managed ones. That's not all of it." Right. So, it was like It was like, "Oh, maybe I should give it all of it." Yeah. Yeah, I've been I've been like Yeah, there's been a couple of things where, "Okay, I can just do this in two seconds or I'm I'm just going to keep shouting at CAD just so it has the base to work with." And it's been It's been kind of paying off. Oh. Yeah.
- **HU:** Ööö lényegében ezt ezt teszteltem, és ez ez egész egész jó. Ez Ez olyan adok-kapok, nem? Lényegében ott tartottam, hogy átadtam neki az ööö fájlútvonalat. És nagyrészt már tudtam is, hogy hol van, de elküldtem neki egy képernyőképet arról, hogy hogyan néz ki most a felület, és hogy milyet szeretnék. És ez Ez elég közel volt. Végig kellett csinálnom néhány iterációt, amíg megmondtam neki, hogy rendezze át a dolgokat, de az határozottan sokat segített, hogy ööö beletettétek a felületbe a funkciókulcsokat. Meg Ó, igen. Hát ez volt a lényeg. Ha ööö ha be akartam volna dobni CAD-be, ööö az volt a legegyszerűbb módja a leképezésnek. Igen. Szóval, igen. Ez Ez elég jó. Tökéletesen leképezte. Ööö és aztán a sorok valahogy furcsa helyeken voltak, és addig kellett ordibálnom vele, amíg Igen. ööö a megfelelő helyre nem tette a dolgokat. Na persze, nem adtam meg különbséget a dátummezők meg a többi meg a szövegszerkesztők között, szóval biztos, hogy ööö az elszúrta az időzítést, de ööö igen. Nem. Nem. Ez azért van, mert a törzsadat XML a kód bázisban van, és ordibáltam vele, hogy ellenőrizze azt. Ööö ez Ez mindent jól csinált. Ó, nem akartam ezt csinálni, mert a napokban csináltam valamit, és ööö a Code arra panaszkodott, hogy: „Jó, hát az nincsen benne a törzsadat XML-ben.” Erre én: „Ó, haver, az Azok csak a felügyelt adatok. Az nem az egész.” Úgyhogy olyan volt, mintha Az volt, hogy: „Ó, talán az egészet oda kéne adnom neki.” Igen. Igen, én én olyan voltam, hogy Igen, volt néhány dolog, hogy: „Jó, ezt meg tudom csinálni két másodperc alatt, vagy inkább tovább ordibálok a CAD-del, csak hogy legyen egy alap, amivel dolgozhat.” És ez Ez eddig egész kifizetődőnek tűnik. Ó. Igen.

---

### [4] · 4:00:10 PM

- **EN:** I know, something that's been super helpful on uh issues. Um I don't I don't have I I basically have uh a CAD instance set up for dev and UAT. Uh and so depending on what I'm working on, but then the other day I added a uh prod replication. path in my QA library. Mhm. And so then I have a script that will obviously update the prod code in my uh copy. It It'll also grab the top two activity logs and all the uh the GCP logs, um and put that all in there. And so then I can go in there and ask a question about an error or something that I could get at and it will uh look at the uh It'll It'll decipher through all the logs, find the issues, pinpoint what it is. It'll look at the code and then obviously it um helps me make a fix or a patch in QA. So, uh and then I push it back down to dev. So, I mean it's It is so cool. Yeah.
- **HU:** Tudom, valami, ami szuperül segített öhm a problémáknál. Öhm, nincs, nincs, nekem, nekem lényegében van egy CAD példányom beállítva a fejlesztéshez és a UAT-hoz. Öhm, és hát attól függően, hogy éppen min dolgozok, de a napokban hozzáadtam egy öhm éles replikációs útvonalat a QA könyvtáromba. Ühüm. És akkor van egy szkriptem, ami nyilván frissíti az éles kódot a öhm másolatomban. Az az lekéri a két legfrissebb tevékenységnaplót meg az összes öhm a GCP naplót, um, és beleteszi az egészet. És akkor bemehetek oda, és feltehetek egy kérdést egy hibáról vagy valamiről, amihez hozzáférhetek, és az öhm átnézi a öhm... Átnézi, átbogarássza az összes naplót, megtalálja a problémákat, pontosan megállapítja, hogy mi az. Megnézi a kódot, és akkor nyilván öhm segít nekem elkészíteni egy javítást vagy foltozást a QA-ban. Szóval, öhm, és aztán visszatolom a fejlesztői környezetbe. Szóval, azt akarom mondani, hogy ez annyira király. Igen.

---

### [5] · 4:01:08 PM

- **EN:** Oh, good. Yeah, I love it. And then last week's uh Oracle, I guess it was Was it earlier this week? I don't know. Oracle wigged out um and I was uh I mean I got it fixed, but then I was like, "Oh, what the hell? Let's let CAD try to figure out what happened." And it And it deciphered through all the activity logs and it found out that there was a typo in the LDAP sync configuration. So, in a rare edge case when a web user came in with this particular group, it didn't find a match and it was throwing a loop. and uh completely replacing the party table. over and over and over. leading to a massive uh uh redo logs and filling up the uh FRA space. And I was just like, "I would have never found that. I would have never ever found that." Yeah. Oh, that's super cool.
- **HU:** Ó, nagyszerű. Igen, imádom. Aztán a múlt heti, ööö, Oracle – hát, az volt az? Vagy a héten korábban? Nem tudom. Az Oracle teljesen kiakadt, ööö, és én, ööö, szóval helyrehoztam, de aztán arra gondoltam: „Ó, mi a fene? Próbáljuk meg kideríteni a CAD-del, hogy mi történt.” És átfésülte az összes tevékenységi naplót, és kiderítette, hogy elírás történt az LDAP-szinkronizációs beállításban. Szóval egy ritka peremes esetben, amikor egy webes felhasználó ezzel a特定 csoporttal jelentkezett be, nem talált egyezést, és végtelen ciklusba futott, ööö, és újra meg újra, meg újra teljesen lecserélte a party táblát, ami hatalmas, ööö, újraírási naplókhoz vezetett, és feltöltötte az, ööö, FRA-területet. És én csak úgy voltam vele: „Ezt soha nem találtam volna meg. Ezt soha, a büdös életben nem találtam volna meg.” Ja. Ó, ez szupermenő.

---

### [6] · 4:01:12 PM

- **EN:** It's crazy. Yeah.
- **HU:** translating…

---

### [7] · 4:01:24 PM

- **EN:** All right. Well, that uh UI card was the only really card that I had. Um so, Okay. Yeah, I'm I'm committing it right now. I just finished testing it. Yeah.
- **HU:** translating…

---

### [8] · 4:01:54 PM

- **EN:** Uh but along that UI, uh I did I I did some UI updates for Sachi a while back. And the I mean, obviously, Sachi doesn't have that much desktop customizations. Um but they're built off of the current client customization base and then the customization file just has the overrides in the customizations in it.
- **HU:** translating…

---

### [9] · 4:02:41 PM

- **EN:** completed 42 deployment that MSP built and that was before Synchr change that customization file just to be the bespoke changes and so we have massive amounts of old UI that's just full code copied and pasted in the customization file versus the the base. Mhm. I I've been talking to um the studio about potentially um going through all the UI customizations and um getting rid of stuff that we don't use anymore. But uh Yeah. it would be nice to uh get Cole's to sign off on spending some time on um
- **HU:** translating…

---

### [10] · 4:02:50 PM

- **EN:** getting getting their client customizations back in line with um what a new Synchr install looks like. Right. Cuz we got a lot
- **HU:** visszaállítani az ügyfélszövezezéseket ööö arra, hogy hogy néz ki egy új Censhare-telepítés. Pontosan. Mert van egy csomónk

---
