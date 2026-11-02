<script lang="ts">
	// Reproduces Clerk's DOM nesting with the real `.cl-*` classes (from @clerk/ui 1.42 sources) and
	// a rough, zero-specificity stand-in for Clerk's own base styles. NOT the real window.
	let { data } = $props();
</script>

<div class="cl-modalBackdrop fx-backdrop">
	<div class="cl-modalContent fx-modal" role="dialog" aria-modal="true" aria-label="Manage account (fixture)">
		<div class="cl-rootBox cl-userProfile-root" style:max-width={data.bug ? '28rem' : undefined} style:width={data.bug ? '100%' : undefined}>
			<div class="cl-cardBox" style:width={data.bug ? '100%' : undefined} style:max-width={data.bug ? '100%' : undefined}>
				<div class="cl-card fx-card">
					<div class="cl-navbar fx-navbar">
						<div class="fx-navhead">
							<h1 class="cl-headerTitle fx-h1">Account</h1>
							<p class="cl-headerSubtitle fx-sub">Manage your account info.</p>
						</div>
						<div class="cl-navbarButtons fx-navbtns">
							<a class="cl-button cl-navbarButton fx-navbtn" class:cl-active={data.tab === 'profile'} data-variant="unstyled" data-color="primary" href="?tab=profile"><span class="cl-navbarButtonText">Profile</span></a>
							<a class="cl-button cl-navbarButton fx-navbtn" class:cl-active={data.tab === 'security'} data-variant="unstyled" data-color="neutral" href="?tab=security"><span class="cl-navbarButtonText">Security</span></a>
						</div>
						<div class="cl-footerItem fx-footer"><div data-clerk-dev-mode-overlay class="fx-overlay"></div><span>Secured by Clerk</span><span>Development mode</span></div>
					</div>
					<div class="cl-navbarMobileMenuRow fx-mobilerow"><button class="cl-button cl-navbarMobileMenuButton" data-variant="ghost" data-color="neutral">Menu</button></div>
					<div class="cl-scrollBox fx-scrollbox">
						<div class="cl-pageScrollBox fx-scroll">
							<div class="cl-page fx-page">
								{#if data.tab === 'profile'}
									<h2 class="cl-headerTitle fx-h2">Profile details</h2>
									<div class="cl-profileSection">
										<div class="cl-profileSectionHeader"><p class="cl-profileSectionTitleText">Profile</p></div>
										<div class="cl-profileSectionContent">
											<div class="cl-profileSectionItem fx-row">
												<div class="fx-avatar" aria-hidden="true">TF</div>
												<div class="fx-grow"><div class="cl-userPreviewMainIdentifier">Ted Fulk</div><button class="cl-button cl-avatarImageActionsUpload" data-variant="ghost" data-color="primary">Upload</button></div>
												<button class="cl-button cl-profileSectionPrimaryButton" data-variant="ghost" data-color="primary">Update profile</button>
											</div>
										</div>
									</div>
									<div class="cl-profileSection">
										<div class="cl-profileSectionHeader"><p class="cl-profileSectionTitleText">Email addresses</p></div>
										<div class="cl-profileSectionContent">
											<div class="cl-profileSectionItem fx-row"><div class="fx-grow">ted.example@example.com <span class="cl-badge">Primary</span> <span class="cl-badge">Verified</span></div><button class="cl-button cl-menuButton" data-variant="ghost" data-color="neutral" aria-label="Actions"><span style="letter-spacing:.1em">&bull;&bull;&bull;</span></button></div>
											<button class="cl-button cl-profileSectionPrimaryButton" data-variant="ghost" data-color="primary">+ Add email address</button>
										</div>
									</div>
									<div class="cl-profileSection">
										<div class="cl-profileSectionHeader"><p class="cl-profileSectionTitleText">Connected accounts</p></div>
										<div class="cl-profileSectionContent">
											<div class="cl-profileSectionItem fx-row"><div class="fx-grow">Google <span class="cl-userPreviewSecondaryIdentifier">ted.example@example.com</span></div><button class="cl-button cl-menuButton" data-variant="ghost" data-color="neutral" aria-label="Actions"><span style="letter-spacing:.1em">&bull;&bull;&bull;</span></button></div>
											<button class="cl-button cl-profileSectionPrimaryButton" data-variant="ghost" data-color="primary">+ Connect account</button>
										</div>
									</div>
									<form class="fx-form">
										<label class="cl-formFieldLabel" for="fx-name">First name</label>
										<input id="fx-name" class="cl-formFieldInput" value="Ted" />
										<div class="fx-btns"><button type="button" class="cl-button cl-formButtonPrimary" data-variant="solid" data-color="primary">Save</button><button type="button" class="cl-button cl-formButtonReset" data-variant="outline" data-color="neutral">Cancel</button></div>
									</form>
								{:else}
									<h2 class="cl-headerTitle fx-h2">Security</h2>
									<div class="cl-profileSection">
										<div class="cl-profileSectionHeader"><p class="cl-profileSectionTitleText">Password</p></div>
										<div class="cl-profileSectionContent"><div class="cl-profileSectionItem fx-row"><div class="fx-grow">••••••••••</div><button class="cl-button cl-profileSectionPrimaryButton" data-variant="ghost" data-color="primary">Update password</button></div></div>
									</div>
									<div class="cl-profileSection">
										<div class="cl-profileSectionHeader"><p class="cl-profileSectionTitleText">Active devices</p></div>
										<div class="cl-profileSectionContent">
											<div class="cl-profileSectionItem cl-profileSectionItemList fx-row">
												<div class="cl-activeDevice fx-device">
													<svg class="cl-activeDeviceIcon fx-devicon" viewBox="0 0 32 32"><rect x="4" y="6" width="24" height="16" rx="2" fill="var(--cl-chassis-back)" /><rect x="6" y="8" width="20" height="12" fill="var(--cl-screen)" /><rect x="2" y="23" width="28" height="3" rx="1.5" fill="var(--cl-chassis-bottom)" /></svg>
													<div><div>Windows <span class="cl-badge">This device</span></div><div class="fx-m">Chrome 130.0</div><div class="fx-m">203.0.113.7 (Durham, US)</div><div class="fx-m">Today at 9:41 AM</div></div>
												</div>
											</div>
											<div class="cl-profileSectionItem fx-row">
												<div class="cl-activeDevice fx-device">
													<svg class="cl-activeDeviceIcon fx-devicon" viewBox="0 0 32 32"><rect x="10" y="3" width="12" height="26" rx="2" fill="var(--cl-chassis-back)" /><rect x="12" y="6" width="8" height="19" fill="var(--cl-screen)" /></svg>
													<div><div>iPhone</div><div class="fx-m">Safari 18.1</div><div class="fx-m">198.51.100.4 (Raleigh, US)</div></div>
												</div>
												<button class="cl-button cl-menuButton" data-variant="ghost" data-color="neutral" aria-label="Actions"><span style="letter-spacing:.1em">&bull;&bull;&bull;</span></button>
											</div>
										</div>
									</div>
									<div class="cl-profileSection">
										<div class="cl-profileSectionHeader"><p class="cl-profileSectionTitleText">Delete account</p></div>
										<div class="cl-profileSectionContent"><div class="cl-profileSectionItem fx-row"><div class="fx-grow">Permanently remove your account.</div><button class="cl-button" data-variant="ghost" data-color="danger">Delete account</button></div>
											<div class="fx-btns"><button class="cl-button" data-variant="solid" data-color="danger">Delete account</button><button class="cl-button" data-variant="outline" data-color="danger">Remove</button></div>
											<div class="cl-menuList fx-menu" role="menu"><button class="cl-button cl-menuItem" role="menuitem" data-variant="ghost" data-color="neutral">Set as primary</button><button class="cl-button cl-menuItem" role="menuitem" data-variant="ghost" data-color="danger">Remove</button></div>
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* Stand-in for Clerk's own base styles (zero specificity so clerk.css wins, as in the real window) */
	:where(.fx-backdrop) { position: fixed; inset: 0; overflow: auto; display: flex; justify-content: center; align-items: flex-start; background: color-mix(in srgb, var(--color-secondary-950) 65%, transparent); z-index: 50; font-family: var(--typo-base--font-family); }
	:where(.fx-modal) { margin: 4rem 0; position: relative; }
	:where(.fx-card) { width: 55rem; max-width: calc(100vw - 2rem); height: 44rem; max-height: calc(100vh - 8rem); display: flex; flex-direction: row; overflow: hidden; background: light-dark(white, #1c1c1c); color: light-dark(#222, #eee); border-radius: 1rem; border: 1px solid light-dark(#ddd, #444); }
	:where(.fx-navbar) { width: 14rem; display: flex; flex-direction: column; padding: 1.5rem 1rem; gap: 1rem; background: light-dark(#fafafa, #151515); position: relative; }
	:where(.fx-navbtns) { display: flex; flex-direction: column; gap: .125rem; }
	:where(.fx-navbtn) { display: flex; padding: .5rem .75rem; text-decoration: none; color: light-dark(#666, #aaa); border-radius: .5rem; cursor: pointer; }
	:where(.fx-footer) { margin-top: auto; display: flex; flex-direction: column; font-size: .75rem; position: relative; min-height: 3rem; }
	:where(.fx-overlay) { position: absolute; inset: 0; background: repeating-linear-gradient(45deg, orange 0 2px, transparent 2px 8px); opacity: .5; }
	:where(.fx-scrollbox) { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid light-dark(#ddd, #333); }
	:where(.fx-scroll) { flex: 1; overflow: auto; scrollbar-gutter: stable; }
	:where(.fx-page) { padding: 2rem; display: flex; flex-direction: column; gap: 1.5rem; }
	:where(.fx-h1) { font-size: 1.25rem; margin: 0; }
	:where(.fx-h2) { font-size: 1.25rem; margin: 0; }
	:where(.fx-sub) { margin: 0; font-size: .875rem; color: light-dark(#777, #999); }
	:where(.fx-row) { display: flex; align-items: center; gap: .75rem; padding: .75rem 0; border-top: 1px solid light-dark(#eee, #333); }
	:where(.fx-grow) { flex: 1; min-width: 0; }
	:where(.fx-device) { display: flex; gap: 1rem; overflow: hidden; width: 100%; }
	:where(.fx-devicon) { --cl-chassis-bottom: #444; --cl-chassis-back: #343434; --cl-chassis-screen: #575757; --cl-screen: #000; width: 2rem; height: 2rem; }
	:where(.fx-m) { color: light-dark(#777, #999); font-size: .875rem; }
	:where(.fx-avatar) { width: 3rem; height: 3rem; border-radius: 50%; display: grid; place-items: center; background: light-dark(#ddd, #444); }
	:where(.fx-form) { display: flex; flex-direction: column; gap: .5rem; }
	:where(.fx-btns) { display: flex; gap: .75rem; padding-top: .5rem; flex-wrap: wrap; }
	:where(.fx-menu) { display: flex; flex-direction: column; padding: .25rem; width: 12rem; }
	:where(.fx-mobilerow) { display: none; }
	:where(.cl-button) { display: inline-flex; align-items: center; padding: .5rem 1rem; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; }
	:where(.cl-badge) { display: inline-block; padding: 0 .5rem; font-size: .75rem; margin-left: .25rem; background: light-dark(#eee, #333); }
	:where(.cl-formFieldInput) { height: 2.25rem; padding: 0 .75rem; border: 1px solid light-dark(#ccc, #555); border-radius: .5rem; background: transparent; color: inherit; }
	@media (max-width: 47.99em) {
		:where(.fx-modal) { margin: 0; width: 100vw; }
		:where(.fx-card) { width: 100vw; height: 100vh; max-height: none; flex-direction: column; border-radius: 0; }
		:where(.fx-navbar) { display: none; }
		:where(.fx-mobilerow) { display: flex; padding: .75rem 1rem; }
		:where(.fx-page) { padding: 1rem; }
	}
</style>
