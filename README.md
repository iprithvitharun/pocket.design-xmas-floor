# Pocket Christmas Floor

A fan-made Chrome extension for [pocket.design](https://pocket.design). It drops a pixel cat into Pocket FM's office page, lets you drive it around, and turns the doormat into an elevator up to a Christmas version of the same floor.

It only draws on top of the page in your own browser, and nothing on Pocket FM's side changes. The only network requests are the extension reading the arcade leaderboard from this project's GitHub repo, and opening GitHub in a new tab if you choose to send a score.

## Install

You need Google Chrome on a computer. There's nothing to build and no dependencies.

1. Get the code: run `git clone https://github.com/iprithvitharun/pocket.design-xmas-floor.git`, or on GitHub click **Code → Download ZIP** and unzip it.
2. Type `chrome://extensions` into Chrome's address bar.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the folder with `manifest.json` in it: `pocket.design-xmas-floor` if you cloned it, `pocket.design-xmas-floor-main` if you downloaded the ZIP.
5. Open or reload https://pocket.design.
6. The cat walks in on its own. If you send it home, **🐾 Bring the cat in** (bottom right) brings it back.

After you change any file, click the reload icon on the extension's card in `chrome://extensions` and reload the page.

**Setting this up with an AI agent?** Paste this repo's link into your coding agent and ask it to set it up.

> Note for the agent: clone the repo; there is no build step. Chrome only lets a person load an unpacked extension, so don't try to install it from a script. Give the person steps 2–6 with the absolute path of the cloned folder filled in for step 4, then show them the Controls table below.

## Controls

| Action | Keyboard | Controller |
| --- | --- | --- |
| Move | W A S D or arrow keys | Left stick or D-pad |
| Say hi to someone / play the arcade | Space | A |
| Leave the arcade | Esc, or click EXIT | B |
| Add your score to the leaderboard | When the round ends, Enter (yes), type a name, Enter again (Esc goes back) | X, then A sends your saved name |
| Ride the elevator | Walk onto the doormat | Walk onto the doormat |

When you stop, the cat sits down. Leave it for about 9 seconds and it yawns and walks off to the warmest spot it can reach: the nearest diyas on the floor on Floor 1, the foot of the tree on Floor 2. It finds its way round the hiring card and the furniture and never steps on the doormat. There it curls up, and when someone walks past it opens one eye to watch them. Any key wakes it up, and moving takes over straight away.

## What happens

The cat walks round the furniture rather than through it: sofas, tables, chairs, the desk, plants, lamps, the pets and the low front walls (and the tree on Floor 2). Rugs, the rangoli and the floor signs are floor, so it walks over those.

**Floor 1** is the page as Pocket FM shipped it. The office starts hidden under a cream "fog" that clears wherever your cursor goes. The cat clears it too, in the same blocky tiles.

**Floor 2** is the same office at Christmas. The Diwali decor comes down and Christmas goes up in the same spots:

- the marigold garlands become pine garlands with red bows, baubles and twinkling bulbs
- the diyas become red candles in holly, the rings of diyas become Advent wreaths, the plate of diyas becomes a plate of gingerbread cookies, and the box of sweets becomes a gingerbread house
- the paper star lanterns stay up, turned Christmas red (Christmas stars, as they're hung in Kerala and Goa)
- a decorated tree with presents stands where the rangoli was
- everyone is dressed for winter: their top becomes a knitted jumper in the same colour family, with a Fair Isle band across the chest, plus sleeves down to the wrist, mittens, a striped scarf and wool tights on bare legs. Everyone wears a Santa hat that rides on their head, with a floppy tip that swings as they walk
- the pets join in: Coco wears reindeer antlers, Evie's flower crown and Zima's collar turn to holly, and Goldie swaps her kurta for a red knitted jumper. Paw, the cat in the hiring card, gets a Santa hat
- snow falls outside the back windows and settles on the sills, and flurries blow in at the front door
- the room is lit warm inside, with the cold at the edges; the walls turn pine green
- the two signs read "SOCKS ON, FEET UP." and "SNOW GOOD TO SEE YOU."
- the cat leaves snowy paw prints behind it

Walk up to anyone and press Space and they'll say something back.

## The arcade

Walk up to the arcade cabinet in the top-left corner and press Space. Floor 1 has **Fish Catcher** (catch fish on a rooftop at night, dodge cucumbers). Floor 2 has **Gift Catcher** (catch presents in the snow, dodge coal). A round is 40 seconds and 3 lives; gold fish and gold presents are worth 3. Your best score is saved in the browser.

The cabinet is pixel art all the way through: marquee, bezel, screen, control panel, the 5×7 font and the cat, all on one pixel grid. The joystick leans as you move and START dips when you press it.

**Leaderboard.** The attract screen shows the top five, plus your own row if you're further down. When a round that scored 1 or more ends, the arcade asks if you want to add it to the leaderboard and says where it would rank. Press Enter for yes, type a name (up to 10 letters) and press Enter again: the game opens a pre-filled GitHub issue. Press **Create** and you're done. A bot replays your round from its seed and your moves, and if the score matches and beats your best on the board, it opens a pull request. Once that's merged, your score is on the board for everyone who has the extension. You need a GitHub account to send a score.

## How it works

- **Live page as the stage.** The extension doesn't copy Pocket FM's art; the only changes to it are recolours made in memory on Floor 2 (the clothes, the pets' accessories, the star lanterns). It reads the page's layout every frame: the hiring card, the doormat, the arcade cabinet, the rangoli, and where each teammate is walking (their "Meet …" buttons and name tags). Then it draws on a transparent canvas on top.
- **Fog mirror.** The page repaints its fog canvas every frame, so you can't just erase it. The extension hides the page's fog canvas and draws a copy of it every frame, with the cat's path cut out. Your cursor reveal keeps working as before.
- **Floor 2** sets the page's own `--skin-*` colour tokens to a winter palette, sets `data-floor-skin="christmas"` and `data-paw-floor="2"`, and swaps the text on the two signs. It restores every one of these when you ride back down or send the cat home.
- **Decor in the page's own layer.** The page labels its festival decor (`data-skin-decor="toran-left"`, `"diya-work"` and so on). Each piece gets a Christmas counterpart through CSS `content`, which replaces what an `<img>` shows. The page keeps its own layout and layering, so the arcade still stands in front of the garland and people still walk in front of the candles. Flames and bulbs flicker by cycling a few frames.
- **Winter wardrobe.** `wardrobe.js` reads each teammate's own sprite images in your browser. It finds the face (and from it the skin tone), the neck, the top they're wearing, bare arms, hands and legs, and repaints them, keeping the original shading. It works per view (front, side, back) so the scarf stays put while someone walks. The work runs in background workers and starts as soon as the cat is in, so most people are dressed by the time the doors open. Walking sheets are swapped through `background-image`, seated poses through CSS `content`.
- **Arcade.** The rules (`arcade-sim.js`) advance in fixed 1/60 s steps from a seeded random number generator and use only arithmetic that gives the same result in every JavaScript engine. So a round is fully described by its seed and the left/right/still move of each step (2 bits a step, about 800 characters for a full round). The art (`arcade-art.js`) draws the whole cabinet into a 276×250 canvas at one canvas pixel per art pixel, and the page scales it by a whole number of device pixels with `image-rendering: pixelated`.
- **Furniture.** Every piece of furniture on the page is an `<img>` the page tags as a prop. Each image is scanned once for its solid pixels and described as up to four stacked boxes that follow its shape (a wall and the post above it, a lamp's shade and its pole), taking the page's own `object-fit` and mirroring into account. Tall, narrow pieces such as plants only block at their base, so the cat can pass behind the leaves. The naps use the same boxes to find the shortest walk to the nearest warm spot.
- **Top layer.** The elevator and the arcade open as manual popovers, so nothing on the page can stack above them. The everyday controls stay in the normal layer, so they never cover the page's own dialogs.

## Running the leaderboard

The leaderboard is a GitHub repo with no server: issues in, pull requests to review, a JSON file out.

1. Push this folder to a public GitHub repo. `REPO` at the top of `src/background.js` must match (`owner/name`).
2. In the repo, open **Settings → Actions → General → Workflow permissions** and turn on **Allow GitHub Actions to create and approve pull requests**.
3. Players send scores from the arcade. For each "Score:" issue, `.github/workflows/score.yml` replays the run with `tools/take-submission.js`. A good run gets a pull request that adds `leaderboard/runs/<game>-<issue>.json`. A run that doesn't replay to its score, was sent before, or doesn't beat that player's best on the board gets a reply saying why, and the issue is closed.
4. Merge the pull requests you're happy with. `.github/workflows/leaderboard.yml` replays every run again and rebuilds `leaderboard.json` (each player's best, the top 100 per game). The extension picks it up within a few minutes.

To check runs by hand: `node tools/build-leaderboard.js`.

Replaying stops anyone from editing a score, the moves or the seed, and from sending the same round twice. It can't stop someone who writes a bot to play for them, so you're the last check: that's what reviewing the pull request is for.

## Files

```
manifest.json      Manifest V3: a content script for https://pocket.design/* and a background worker
src/catsprite.js   the cat: a rigged tabby (4 jointed legs, tail) that trots, sits, curls up, wears a hat
src/xmasprops.js   tree, gifts, Santa hats, snow drifts, paw prints
src/wardrobe.js    winter clothes for the teammates (jumper, scarf, mittens, tights), made in a worker
src/decor.js       Christmas decor in place of the Diwali decor, and the pets' accessories
src/arcade-sim.js  the arcade's rules: deterministic, so a round can be replayed from its seed and moves
src/arcade-art.js  the arcade cabinet, both games' scenes and sprites, and a 5×7 pixel font
src/content.js     the engine: input, fog mirror, elevator, Floor 2, greetings, the arcade's controls
src/content.css    overlay styles (they borrow the page's own button styling)
src/background.js  reads leaderboard.json from GitHub; opens the pre-filled score issue
tools/             replay check (runs.js), issue intake (take-submission.js), leaderboard build
leaderboard/runs/  one JSON file per accepted score
leaderboard.json   the board the extension reads (built by the workflow)
.github/workflows/ score.yml (issue → checked pull request), leaderboard.yml (merge → leaderboard.json)
```

All sprites are original and drawn in code. The cat is sized against the page's own pets: about as big as Zima curled up, smaller than the dogs. It is drawn at 1 CSS px per pixel, so it is as finely detailed as they are. Each pose is a small rig (body, head, four two-joint legs, a curved tail) that is rasterised to a pixel grid, snapped to a palette, then shaded and outlined; frames are cached. The props (tree, gifts, hats, snow) are drawn at 2 CSS px per pixel and were authored with OpenAI Codex. The new decor (garland, candles, wreaths, cookies, gingerbread house, antlers) is drawn at about 2.25 CSS px per pixel, the grid the page's own people and props use. The arcade (cabinet, fish, cucumbers, presents, coal, both scenes and the font) is drawn in code too, on its own pixel grid.

## Notes

- Built and tested against pocket.design as of November 2026. If the page's layout or class names change, the cat still works, but some anchors (tree spot, arcade, signs) may need adjusting in `locate()` in `src/content.js`.
- Not affiliated with Pocket FM. Pocket FM's art, characters and copy belong to them. This only decorates the page in your own browser: the recoloured clothes and decor are made on the fly in memory, never saved or sent anywhere.
