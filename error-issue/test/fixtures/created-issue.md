Details
---
**Error report:** [link](http://go/ampe/CL6chqbN2-bzBA)
**First seen:** Feb 25, 2020
**Frequency:** ~ 54,647/day

Stacktrace
---
```
Error: null is not an object (evaluating 'b.acceleration.x')
    at x (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/extensions/amp-delight-player/0.1/amp-delight-player.js:421:13)
    at event (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/src/event-helper-listen.js:58:27)
```

Notes
---
`@xymw` modified `extensions/amp-delight-player/0.1/amp-delight-player.js:396-439` in #17939 (Nov 12, 2018)
`@rsimha` modified `src/event-helper-listen.js:57-59` in #12450 (Dec 13, 2017)

**Possible assignees:** `@xymw`
