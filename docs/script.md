# Walkthrough Script

This application is now a Yum Brands portfolio pricing command center.

The first thing to notice is that the flow starts with the current Yum brand situation, not with a simulator. The opening screen shows current demand, realized price, margin quality, promo dependence, and weighted elasticity so the business context is clear before any deep dive.

Step 2 opens the data foundation directly. This is important because the demo now shows exactly what tables are being used, which makes the analysis feel grounded in real modeled operating data rather than mocked UI.

Steps 3 and 4 move into customer cohorts and segment elasticity. This is where the user sees that Yum demand is not one curve and that different missions respond differently to price.

Step 5 is the main elasticity story. The acquisition view is scoped to a selected brand, selected mission, and selected channel, then translated into simple business summary bullets and recommended actions.

Step 6 adds promotion context so price decisions can be read against current offer support and seasonal windows.

Step 7 closes with AI chat. The AI is there to explain what the user is seeing, summarize the business, and answer follow-up questions from the same Yum data foundation and elasticity logic shown in the app.
