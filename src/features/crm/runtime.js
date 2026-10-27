import { visibleActorLog } from "./log-visibility.js";
import {
  WORK_STAGES,
  STOCK_STAGES,
  workType,
  variationAdjustments,
  stockFacts,
  companyStockLine,
  activeLine,
  activeStages,
  applicableTask,
  stageType,
  stageLabel,
  reconcileWorkflow,
  nextStage,
  completionError,
} from "./job-workflow.js";
import { createJobWorkflowControls } from "./job-workflow-controls.js";
import { createLifecycle } from "./lifecycle";
import { createMasterControls } from "./master-controls.js";
import { createAccountControls } from "./account-controls.js";
import { createInventoryControls } from "./inventory-controls.js";
import { createJobApprovalControls } from "./job-approval-controls.js";
import { EMPTY_INVENTORY, inventoryRows } from "./inventory-model.js";
import { usersModule } from "./accounts-backend.js";
import { modulePath, moduleFromPath } from "./routes";
import { createSeed } from "./data/seed";
import { createShell } from "./views/shell";
import { createAccess } from "./views/access";
import { createOperations } from "./views/operations";
import { createWarehouse } from "./views/warehouse";
import { createFinance } from "./views/finance";
import { createChat } from "./views/chat";

/** Client-only workflow compatibility layer; no iframe, eval, or script injection. */
export function mountCRM(root, initialPage = "dashboard", options = {}) {
  const initialViewer = options.viewer || null;
  const authBackend = options.auth || null;
  const cloud = options.cloud || null;
  let accountSnapshot = options.accounts || null;
  let accountControls = null;
  let masterControls = null;
  let inventoryControls = null;
  let jobApprovals = null;
  let workflowControls = null;
  let accessFailure = null;
  let identityChanging = false;
  // The server verifies Super Admin tools through get_access_context.
  const verifiedOwnerId = options.ownerVerified
    ? initialViewer?.id || null
    : null;
  const lifecycle = createLifecycle();
  const {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame,
    cancelAnimationFrame,
  } = lifecycle;
  const ctx = {
    root,
    get workType() {
      return workType;
    },
    get workflowControls() {
      return workflowControls;
    },
    get activeStages() {
      return activeStages;
    },
    get stageLabel() {
      return stageLabel;
    },
    get jobApprovals() {
      return jobApprovals;
    },
    get jobApprovalStatus() {
      return jobApprovalStatus;
    },
    get jobBadges() {
      return jobBadges;
    },
    get inventoryControls() {
      return inventoryControls;
    },
    get inventoryCollectionConfirmed() {
      return inventoryCollectionConfirmed;
    },
    async prepareIdentityChange() {
      identityChanging = true;
      clearTimeout(cloudTimer);
      cloudDirty = false;
      await cloudFlushing;
      clearTimeout(cloudTimer);
      cloudDirty = false;
    },
    get masterControls() {
      return masterControls;
    },
    get visiblePage() {
      return visiblePage;
    },
    get accountControls() {
      return accountControls;
    },
    get STORAGE_KEY() {
      return STORAGE_KEY;
    },
    get OWNER_EMAIL() {
      return OWNER_EMAIL;
    },
    get MASTER_PATH() {
      return MASTER_PATH;
    },
    get MASTER_SESSION_KEY() {
      return MASTER_SESSION_KEY;
    },
    get $() {
      return $;
    },
    get $$() {
      return $$;
    },
    get uid() {
      return uid;
    },
    get now() {
      return now;
    },
    get iso() {
      return iso;
    },
    get esc() {
      return esc;
    },
    get attr() {
      return attr;
    },
    get money() {
      return money;
    },
    get fmt() {
      return fmt;
    },
    get initials() {
      return initials;
    },
    get deep() {
      return deep;
    },
    get clamp() {
      return clamp;
    },
    get ICONS() {
      return ICONS;
    },
    get icon() {
      return icon;
    },
    get demoChatData() {
      return demoChatData;
    },
    get initialState() {
      return initialState;
    },
    get normalizeState() {
      return normalizeState;
    },
    get load() {
      return load;
    },
    get state() {
      return state;
    },
    get ui() {
      return ui;
    },
    get mediaStream() {
      return mediaStream;
    },
    get toastTimer() {
      return toastTimer;
    },
    get currentUser() {
      return currentUser;
    },
    get isImpersonating() {
      return isImpersonating;
    },
    get isMasterSession() {
      return isMasterSession;
    },
    get actorUser() {
      return actorUser;
    },
    get save() {
      return save;
    },
    get commit() {
      return commit;
    },
    get toast() {
      return toast;
    },
    get log() {
      return log;
    },
    get notify() {
      return notify;
    },
    get userName() {
      return userName;
    },
    get ROLE_LABELS() {
      return ROLE_LABELS;
    },
    get roleLabel() {
      return roleLabel;
    },
    get jobOf() {
      return jobOf;
    },
    get leadOf() {
      return leadOf;
    },
    get quoteOf() {
      return quoteOf;
    },
    get tone() {
      return tone;
    },
    get badge() {
      return badge;
    },
    get NAV() {
      return NAV;
    },
    get PAGE_TITLES() {
      return PAGE_TITLES;
    },
    get leadStages() {
      return leadStages;
    },
    get jobStatuses() {
      return jobStatuses;
    },
    get taskStatuses() {
      return taskStatuses;
    },
    get CAPABILITIES() {
      return CAPABILITIES;
    },
    get canRunAction() {
      return canRunAction;
    },
    get ACTION_CAPABILITY() {
      return ACTION_CAPABILITY;
    },
    get CAPABILITY_ROLES() {
      return CAPABILITY_ROLES;
    },
    get permissionValue() {
      return permissionValue;
    },
    get permissionSource() {
      return permissionSource;
    },
    get hasCapability() {
      return hasCapability;
    },
    get allowedPage() {
      return allowedPage;
    },
    get firstAllowedPage() {
      return firstAllowedPage;
    },
    get route() {
      return route;
    },
    get header() {
      return header;
    },
    get metric() {
      return metric;
    },
    get sectionTitle() {
      return sectionTitle;
    },
    get captureView() {
      return captureView;
    },
    get restoreView() {
      return restoreView;
    },
    get applyActionPermissions() {
      return applyActionPermissions;
    },
    get render() {
      return render;
    },
    get renderLogin() {
      return renderLogin;
    },
    get renderShell() {
      return renderShell;
    },
    get renderMobileTabs() {
      return renderMobileTabs;
    },
    get renderMobileMenu() {
      return renderMobileMenu;
    },
    get renderPage() {
      return renderPage;
    },
    get accessBucket() {
      return accessBucket;
    },
    get setAccessRule() {
      return setAccessRule;
    },
    get clearAccessRules() {
      return clearAccessRules;
    },
    get bulkAccessRules() {
      return bulkAccessRules;
    },
    get permissionRow() {
      return permissionRow;
    },
    get HOSTED_OWNER_KEY() {
      return HOSTED_OWNER_KEY;
    },
    get hostedOwner() {
      return hostedOwner;
    },
    get hostedCheck() {
      return hostedCheck;
    },
    get hostedEpoch() {
      return hostedEpoch;
    },
    get hostedOwnerMode() {
      return hostedOwnerMode;
    },
    get hostedOwnerActive() {
      return hostedOwnerActive;
    },
    get ownerRequest() {
      return ownerRequest;
    },
    get validateHostedTokens() {
      return validateHostedTokens;
    },
    get persistHostedOwner() {
      return persistHostedOwner;
    },
    get forgetHostedOwner() {
      return forgetHostedOwner;
    },
    get revokeHostedToken() {
      return revokeHostedToken;
    },
    get loginHostedOwner() {
      return loginHostedOwner;
    },
    get ensureHostedOwner() {
      return ensureHostedOwner;
    },
    get bootstrapHostedOwner() {
      return bootstrapHostedOwner;
    },
    get changeHostedOwnerPassword() {
      return changeHostedOwnerPassword;
    },
    get renderHostedOwnerLogin() {
      return renderHostedOwnerLogin;
    },
    get isMasterEntry() {
      return isMasterEntry;
    },
    get designatedOwner() {
      return designatedOwner;
    },
    get normalizeOwner() {
      return normalizeOwner;
    },
    get ownerAuthenticated() {
      return ownerAuthenticated;
    },
    get guardSession() {
      return guardSession;
    },
    get clearOwnerSession() {
      return clearOwnerSession;
    },
    get ownerHash() {
      return ownerHash;
    },
    get setOwnerPassword() {
      return setOwnerPassword;
    },
    get completeLogin() {
      return completeLogin;
    },
    get loginStaff() {
      return loginStaff;
    },
    get loginOwner() {
      return loginOwner;
    },
    get renderOwnerLogin() {
      return renderOwnerLogin;
    },
    get ultimateBucket() {
      return ultimateBucket;
    },
    get renderUltimateControl() {
      return renderUltimateControl;
    },
    get ultimateAction() {
      return ultimateAction;
    },
    get renderMasterControl() {
      return renderMasterControl;
    },
    get renderMasterOverview() {
      return renderMasterOverview;
    },
    get renderMasterAccounts() {
      return renderMasterAccounts;
    },
    get renderMasterSecurity() {
      return renderMasterSecurity;
    },
    get resetOwnerDemo() {
      return resetOwnerDemo;
    },
    get renderMasterPermissions() {
      return renderMasterPermissions;
    },
    get renderDashboard() {
      return renderDashboard;
    },
    get renderLeads() {
      return renderLeads;
    },
    get blankDraft() {
      return blankDraft;
    },
    get quoteTotals() {
      return quoteTotals;
    },
    get infoFact() {
      return infoFact;
    },
    get renderLeadWorkspace() {
      return renderLeadWorkspace;
    },
    get renderQuoteCard() {
      return renderQuoteCard;
    },
    get renderContacts() {
      return renderContacts;
    },
    get renderQuotes() {
      return renderQuotes;
    },
    get renderJobs() {
      return renderJobs;
    },
    get renderJobCard() {
      return renderJobCard;
    },
    get inferredTaskStage() {
      return inferredTaskStage;
    },
    get WORK_STAGES() {
      return WORK_STAGES;
    },
    get stageRank() {
      return stageRank;
    },
    get activeJobStage() {
      return activeJobStage;
    },
    get linkedJobTasks() {
      return linkedJobTasks;
    },
    get stageBlockers() {
      return stageBlockers;
    },
    get hasFullStaffAccess() {
      return hasFullStaffAccess;
    },
    get isInstaller() {
      return isInstaller;
    },
    get isStatusAdmin() {
      return isStatusAdmin;
    },
    get ownsJob() {
      return ownsJob;
    },
    get canViewTask() {
      return canViewTask;
    },
    get visibleJobTasks() {
      return visibleJobTasks;
    },
    get workJobId() {
      return workJobId;
    },
    get inWorkJob() {
      return inWorkJob;
    },
    get workProducts() {
      return workProducts;
    },
    get workInvoices() {
      return workInvoices;
    },
    get workPayments() {
      return workPayments;
    },
    get workPurchaseOrders() {
      return workPurchaseOrders;
    },
    get visibleNotifications() {
      return visibleNotifications;
    },
    get stageDestination() {
      return stageDestination;
    },
    get taskDestination() {
      return taskDestination;
    },
    get openRelatedWork() {
      return openRelatedWork;
    },
    get renderWorkContext() {
      return renderWorkContext;
    },
    get adminTaskControls() {
      return adminTaskControls;
    },
    get adminJobControls() {
      return adminJobControls;
    },
    get adminSetJobStatus() {
      return adminSetJobStatus;
    },
    get installerActionAllowed() {
      return installerActionAllowed;
    },
    get canViewJob() {
      return canViewJob;
    },
    get canAdvanceJob() {
      return canAdvanceJob;
    },
    get nextJobStage() {
      return nextJobStage;
    },
    get installationHasReturns() {
      return installationHasReturns;
    },
    get jobTransitionError() {
      return jobTransitionError;
    },
    get deniedWorkflow() {
      return deniedWorkflow;
    },
    get recordJobStage() {
      return recordJobStage;
    },
    get taskUpdateError() {
      return taskUpdateError;
    },
    get updateTaskStatus() {
      return updateTaskStatus;
    },
    get taskActionButtons() {
      return taskActionButtons;
    },
    get stageActionButton() {
      return stageActionButton;
    },
    get renderJobStageTasks() {
      return renderJobStageTasks;
    },
    get saveTaskForm() {
      return saveTaskForm;
    },
    get proofAvailability() {
      return proofAvailability;
    },
    get proofURLs() {
      return proofURLs;
    },
    get proofUploadBusy() {
      return proofUploadBusy;
    },
    get ensureInstallationProofTask() {
      return ensureInstallationProofTask;
    },
    get validProofLocation() {
      return validProofLocation;
    },
    get installationEvidence() {
      return installationEvidence;
    },
    get hasInstallationProof() {
      return hasInstallationProof;
    },
    get proofStore() {
      return proofStore;
    },
    get captureProofLocation() {
      return captureProofLocation;
    },
    get canUploadInstallationProof() {
      return canUploadInstallationProof;
    },
    get prepareProofBlob() {
      return prepareProofBlob;
    },
    get uploadInstallationProof() {
      return uploadInstallationProof;
    },
    get hydrateProofMedia() {
      return hydrateProofMedia;
    },
    get renderInstallationProof() {
      return renderInstallationProof;
    },
    get renderJobDetail() {
      return renderJobDetail;
    },
    get renderTasks() {
      return renderTasks;
    },
    get renderTaskCard() {
      return renderTaskCard;
    },
    get renderCalendar() {
      return renderCalendar;
    },
    get renderInventory() {
      return renderInventory;
    },
    get migrateCollectionFlow() {
      return migrateCollectionFlow;
    },
    get jobPickList() {
      return jobPickList;
    },
    get matchesComplete() {
      return matchesComplete;
    },
    get collectionTask() {
      return collectionTask;
    },
    get locationTask() {
      return locationTask;
    },
    get pickupLocations() {
      return pickupLocations;
    },
    get canConfirmPickup() {
      return canConfirmPickup;
    },
    get canCollectJob() {
      return canCollectJob;
    },
    get autoCompleteEvidenceTasks() {
      return autoCompleteEvidenceTasks;
    },
    get tryAdvanceOperationalJob() {
      return tryAdvanceOperationalJob;
    },
    get confirmPickupLocation() {
      return confirmPickupLocation;
    },
    get pickScanError() {
      return pickScanError;
    },
    get availableStock() {
      return availableStock;
    },
    get lowStockProduct() {
      return lowStockProduct;
    },
    get stockAlertRead() {
      return stockAlertRead;
    },
    get managementStockNote() {
      return managementStockNote;
    },
    get jobProductStock() {
      return jobProductStock;
    },
    get ensureCollectionRestock() {
      return ensureCollectionRestock;
    },
    get syncInventoryAlerts() {
      return syncInventoryAlerts;
    },
    get renderStockAlerts() {
      return renderStockAlerts;
    },
    get collectionStockError() {
      return collectionStockError;
    },
    get scanPickList() {
      return scanPickList;
    },
    get confirmCollection() {
      return confirmCollection;
    },
    get renderPickingState() {
      return renderPickingState;
    },
    get renderPicking() {
      return renderPicking;
    },
    get renderOriginalPicking() {
      return renderOriginalPicking;
    },
    get visiblePickLists() {
      return visiblePickLists;
    },
    get allJobItems() {
      return allJobItems;
    },
    get returnReason() {
      return returnReason;
    },
    get selfCollectReturn() {
      return selfCollectReturn;
    },
    get markJobProvisional() {
      return markJobProvisional;
    },
    get reopenJob() {
      return reopenJob;
    },
    get requestOf() {
      return requestOf;
    },
    get canViewProductRequest() {
      return canViewProductRequest;
    },
    get requestProduct() {
      return requestProduct;
    },
    get completeRequestTasks() {
      return completeRequestTasks;
    },
    get decideProductRequest() {
      return decideProductRequest;
    },
    get approveReturnSKU() {
      return approveReturnSKU;
    },
    get returnHasSupply() {
      return returnHasSupply;
    },
    get cancelProductRequest() {
      return cancelProductRequest;
    },
    get canCollectRequest() {
      return canCollectRequest;
    },
    get openProductRequest() {
      return openProductRequest;
    },
    get confirmRequestLocation() {
      return confirmRequestLocation;
    },
    get scanProductRequest() {
      return scanProductRequest;
    },
    get initializeBillingBasis() {
      return initializeBillingBasis;
    },
    get saveBillingBasis() {
      return saveBillingBasis;
    },
    get roundMoney() {
      return roundMoney;
    },
    get finalJobAmounts() {
      return finalJobAmounts;
    },
    get finalFinancialError() {
      return finalFinancialError;
    },
    get updateJobBalances() {
      return updateJobBalances;
    },
    get finalizeJobBilling() {
      return finalizeJobBilling;
    },
    get renderProductRequestForm() {
      return renderProductRequestForm;
    },
    get renderProductRequests() {
      return renderProductRequests;
    },
    get renderReopenControls() {
      return renderReopenControls;
    },
    get renderJobFinancials() {
      return renderJobFinancials;
    },
    get renderSettlementDocument() {
      return renderSettlementDocument;
    },
    get migrateReturns() {
      return migrateReturns;
    },
    get returnOf() {
      return returnOf;
    },
    get returnManager() {
      return returnManager;
    },
    get canManageReturns() {
      return canManageReturns;
    },
    get canViewReturn() {
      return canViewReturn;
    },
    get canEditReturn() {
      return canEditReturn;
    },
    get canReturnPickup() {
      return canReturnPickup;
    },
    get returnWarehouses() {
      return returnWarehouses;
    },
    get returnUnitsUsed() {
      return returnUnitsUsed;
    },
    get returnAllowance() {
      return returnAllowance;
    },
    get returnEvent() {
      return returnEvent;
    },
    get returnTask() {
      return returnTask;
    },
    get completeReturnTask() {
      return completeReturnTask;
    },
    get openReturnWork() {
      return openReturnWork;
    },
    get startReturn() {
      return startReturn;
    },
    get scanReturn() {
      return scanReturn;
    },
    get submitReturn() {
      return submitReturn;
    },
    get arrangeReturn() {
      return arrangeReturn;
    },
    get cancelReturn() {
      return cancelReturn;
    },
    get collectReturn() {
      return collectReturn;
    },
    get validReturnForm() {
      return validReturnForm;
    },
    get canUploadReturnForm() {
      return canUploadReturnForm;
    },
    get uploadReturnForm() {
      return uploadReturnForm;
    },
    get hydrateReturnForms() {
      return hydrateReturnForms;
    },
    get deliverReturn() {
      return deliverReturn;
    },
    get receiveClientReturn() {
      return receiveClientReturn;
    },
    get processReturn() {
      return processReturn;
    },
    get reconcileLegacyReturn() {
      return reconcileLegacyReturn;
    },
    get renderReturnDetail() {
      return renderReturnDetail;
    },
    get renderReturns() {
      return renderReturns;
    },
    get performAdditionScan() {
      return performAdditionScan;
    },
    get performReturnScan() {
      return performReturnScan;
    },
    get renderEmailSettingsPage() {
      return renderEmailSettingsPage;
    },
    get copyDocumentContent() {
      return copyDocumentContent;
    },
    get renderCopyText() {
      return renderCopyText;
    },
    get canConfigureEmail() {
      return canConfigureEmail;
    },
    get updatePOSupplierInfo() {
      return updatePOSupplierInfo;
    },
    get renderEmailConfig() {
      return renderEmailConfig;
    },
    get emailConfigAction() {
      return emailConfigAction;
    },
    get poLines() {
      return poLines;
    },
    get renderPurchasing() {
      return renderPurchasing;
    },
    get poRow() {
      return poRow;
    },
    get renderProcurementModal() {
      return renderProcurementModal;
    },
    get procurementAction() {
      return procurementAction;
    },
    get renderBilling() {
      return renderBilling;
    },
    get bars() {
      return bars;
    },
    get CLIENT_REPORT_TYPES() {
      return CLIENT_REPORT_TYPES;
    },
    get reportClient() {
      return reportClient;
    },
    get reportClients() {
      return reportClients;
    },
    get REPORT_TYPES() {
      return REPORT_TYPES;
    },
    get reportDate() {
      return reportDate;
    },
    get reportMatches() {
      return reportMatches;
    },
    get createBusinessReport() {
      return createBusinessReport;
    },
    get reportDocument() {
      return reportDocument;
    },
    get renderReports() {
      return renderReports;
    },
    get reportAction() {
      return reportAction;
    },
    get chatUsers() {
      return chatUsers;
    },
    get chatConversationWith() {
      return chatConversationWith;
    },
    get chatMessagesWith() {
      return chatMessagesWith;
    },
    get ensureChatConversation() {
      return ensureChatConversation;
    },
    get chatUnreadFor() {
      return chatUnreadFor;
    },
    get chatUnreadCount() {
      return chatUnreadCount;
    },
    get markChatRead() {
      return markChatRead;
    },
    get chatPreview() {
      return chatPreview;
    },
    get chatSortedUsers() {
      return chatSortedUsers;
    },
    get formatFileSize() {
      return formatFileSize;
    },
    get renderChatPerson() {
      return renderChatPerson;
    },
    get renderChatDirectory() {
      return renderChatDirectory;
    },
    get renderChatAttachment() {
      return renderChatAttachment;
    },
    get renderChatComposer() {
      return renderChatComposer;
    },
    get renderChatThread() {
      return renderChatThread;
    },
    get renderChat() {
      return renderChat;
    },
    get renderChatDock() {
      return renderChatDock;
    },
    get sendChatMessage() {
      return sendChatMessage;
    },
    get canManageAccount() {
      return canManageAccount;
    },
    get renderUserActions() {
      return renderUserActions;
    },
    get renderUsers() {
      return renderUsers;
    },
    visibleLogs() {
      return allowedPage("logs")
        ? state.logs.filter((l) =>
            visibleActorLog(currentUser()?.role, l.actorRole),
          )
        : [];
    },
    get auditLogDisplay() {
      return auditLogDisplay;
    },
    get renderLogs() {
      return renderLogs;
    },
    get renderProfile() {
      return renderProfile;
    },
    get modalFrame() {
      return modalFrame;
    },
    get renderOverlays() {
      return renderOverlays;
    },
    get renderNotifications() {
      return renderNotifications;
    },
    get globalResults() {
      return globalResults;
    },
    get renderSearch() {
      return renderSearch;
    },
    get localDateInput() {
      return localDateInput;
    },
    get renderEditJob() {
      return renderEditJob;
    },
    get saveJobForm() {
      return saveJobForm;
    },
    get renderNewLead() {
      return renderNewLead;
    },
    get renderNewTask() {
      return renderNewTask;
    },
    get renderStockModal() {
      return renderStockModal;
    },
    get renderInvoiceModal() {
      return renderInvoiceModal;
    },
    get renderPaymentModal() {
      return renderPaymentModal;
    },
    get renderNewUser() {
      return renderNewUser;
    },
    get renderEditUser() {
      return renderEditUser;
    },
    get renderChangePassword() {
      return renderChangePassword;
    },
    get renderDeleteUser() {
      return renderDeleteUser;
    },
    get renderSendQuote() {
      return renderSendQuote;
    },
    get quotationView() {
      return quotationView;
    },
    get renderQuotePreview() {
      return renderQuotePreview;
    },
    get formData() {
      return formData;
    },
    get addLead() {
      return addLead;
    },
    get advanceLead() {
      return advanceLead;
    },
    get canManageJobCreation() {
      return canManageJobCreation;
    },
    get canManageJobDetails() {
      return canManageJobDetails;
    },
    get createJobFromQuote() {
      return createJobFromQuote;
    },
    get convertLeadToJob() {
      return convertLeadToJob;
    },
    get saveQuote() {
      return saveQuote;
    },
    get markQuoteReady() {
      return markQuoteReady;
    },
    get sendQuote() {
      return sendQuote;
    },
    get setQuoteStatus() {
      return setQuoteStatus;
    },
    get setJobStatus() {
      return setJobStatus;
    },
    get completeInstallation() {
      return completeInstallation;
    },
    get markReturnReceived() {
      return markReturnReceived;
    },
    get receivePO() {
      return receivePO;
    },
    get createInvoice() {
      return createInvoice;
    },
    get recordPayment() {
      return recordPayment;
    },
    get sendReminder() {
      return sendReminder;
    },
    get addUser() {
      return addUser;
    },
    get toggleUser() {
      return toggleUser;
    },
    get resetPassword() {
      return resetPassword;
    },
    get editUser() {
      return editUser;
    },
    get changeUserPassword() {
      return changeUserPassword;
    },
    get deleteUserAccount() {
      return deleteUserAccount;
    },
    get beginImpersonation() {
      return beginImpersonation;
    },
    get endImpersonation() {
      return endImpersonation;
    },
    get quotationHtmlDocument() {
      return quotationHtmlDocument;
    },
    get downloadQuote() {
      return downloadQuote;
    },
    get closeModal() {
      return closeModal;
    },
    get performScan() {
      return performScan;
    },
    get stopCamera() {
      return stopCamera;
    },
    get startCamera() {
      return startCamera;
    },
    get compressPhoto() {
      return compressPhoto;
    },
    get readChatFile() {
      return readChatFile;
    },
    get handleChatFiles() {
      return handleChatFiles;
    },
    get handleField() {
      return handleField;
    },
    get hash() {
      return hash;
    },
  };
  const { demoChatData, initialState } = createSeed(ctx);
  const {
    renderLogin,
    renderShell,
    renderMobileTabs,
    renderMobileMenu,
    renderPage,
    renderDashboard,
    renderInstallationProof,
    renderOverlays,
    renderNotifications,
    renderSearch,
  } = createShell(ctx);
  const {
    renderHostedOwnerLogin,
    renderOwnerLogin,
    renderUltimateControl,
    renderMasterControl,
    renderMasterOverview,
    renderMasterAccounts,
    renderMasterSecurity,
    renderMasterPermissions,
    renderUserActions,
    renderUsers,
    renderLogs,
    renderProfile,
    renderNewUser,
    renderEditUser,
    renderChangePassword,
    renderDeleteUser,
  } = createAccess(ctx);
  const {
    renderLeads,
    renderLeadWorkspace,
    renderQuoteCard,
    renderContacts,
    renderQuotes,
    renderJobs,
    renderJobCard,
    renderWorkContext,
    renderJobStageTasks,
    renderJobDetail,
    renderTasks,
    renderTaskCard,
    renderCalendar,
    renderEditJob,
    renderNewLead,
    renderNewTask,
    renderSendQuote,
    renderQuotePreview,
  } = createOperations(ctx);
  const {
    renderInventory,
    renderStockAlerts,
    renderPickingState,
    renderPicking,
    renderOriginalPicking,
    renderProductRequestForm,
    renderProductRequests,
    renderReopenControls,
    renderReturnDetail,
    renderReturns,
    renderPurchasing,
    renderProcurementModal,
    renderStockModal,
  } = createWarehouse(ctx);
  const {
    renderJobFinancials,
    renderSettlementDocument,
    renderEmailSettingsPage,
    renderCopyText,
    renderEmailConfig,
    renderBilling,
    renderReports,
    renderInvoiceModal,
    renderPaymentModal,
  } = createFinance(ctx);
  const {
    renderChatPerson,
    renderChatDirectory,
    renderChatAttachment,
    renderChatComposer,
    renderChatThread,
    renderChat,
    renderChatDock,
  } = createChat(ctx);

  const STORAGE_KEY = "ibs-standalone-crm-v1";
  const OWNER_EMAIL = "annasabbas01@gmail.com",
    MASTER_PATH = "/owner",
    MASTER_SESSION_KEY = "ibs-owner-session-v1";
  const $ = (s, r = root) => r.querySelector(s),
    $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const uid = (p = "id") =>
    `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = () => new Date().toISOString();
  const iso = (days = 0, hours = 9) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hours, 0, 0, 0);
    return d.toISOString();
  };
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );
  const attr = (v) => esc(v).replace(/`/g, "&#096;");
  const money = (v) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 2,
    }).format(Number(v) || 0);
  const fmt = (v, time = false) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return esc(v);
    return d.toLocaleDateString(
      "en-AU",
      time
        ? {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }
        : { day: "2-digit", month: "short", year: "numeric" },
    );
  };
  const initials = (n) =>
    String(n || "IB")
      .split(/\s+/)
      .map((x) => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const ICONS = {
    dashboard:
      '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    contact:
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
    briefcase:
      '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    tasks:
      '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    calendar:
      '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    scan: '<path d="M3 5v-2h4M17 3h4v4M21 17v4h-4M7 21H3v-4M7 8v8M10 8v8M14 8v8M17 8v8"/>',
    undo: '<polyline points="9 14 4 9 9 4"/><path d="M4 9h10a6 6 0 0 1 6 6v1"/>',
    truck:
      '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 12 23 16 16 16"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    receipt:
      '<path d="M4 2v20l3-2 3 2 2-2 3 2 2-2 3 2V2l-3 2-3-2-2 2-3-2-2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/>',
    chart:
      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    shield:
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.83 2.83-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21h-4v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06-2.83-2.83.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3v-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06 2.83-2.83.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3h4v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06 2.83 2.83-.06.06A1.65 1.65 0 0 0 19.4 9c.12.6.65 1.01 1.26 1H21v4h-.34c-.61 0-1.14.41-1.26 1z"/>',
    search:
      '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    arrow:
      '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash:
      '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/>',
    phone:
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/>',
    map: '<polygon points="1 6 8 2 16 6 23 2 23 18 16 22 8 18 1 22 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
    camera:
      '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/>',
    paperclip:
      '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    logout:
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    refresh:
      '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  };
  const icon = (name, cls = "") =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;

  function normalizeState(data) {
    normalizeOwner(data);
    data.users.forEach((u) => {
      if (!cloud && u.role !== "super_admin" && !u.password)
        u.password = "demo123";
    });
    data.accessControl = data.accessControl || {
      global: { pages: {}, capabilities: {} },
      users: {},
    };
    data.accessControl.global = data.accessControl.global || {
      pages: {},
      capabilities: {},
    };
    data.accessControl.global.pages = data.accessControl.global.pages || {};
    data.accessControl.global.capabilities =
      data.accessControl.global.capabilities || {};
    data.accessControl.users = data.accessControl.users || {};
    const seededChat = demoChatData();
    if (!Array.isArray(data.conversations))
      data.conversations = seededChat.conversations;
    if (!Array.isArray(data.messages)) data.messages = seededChat.messages;
    data.messages.forEach((m) => {
      m.attachments = Array.isArray(m.attachments) ? m.attachments : [];
      m.readBy = Array.isArray(m.readBy) ? m.readBy : [m.senderId];
    });
    data.tasks.forEach((t) => {
      if (t.jobId && !t.jobStage)
        t.jobStage = inferredTaskStage(
          t,
          data.jobs.find((j) => j.id === t.jobId),
        );
    });
    data.quotes.forEach((q) => {
      const j = data.jobs.find((j) => j.id === q.linkedJobId);
      if (j && !j.quoteId) j.quoteId = q.id;
    });
    migrateCollectionFlow(data);
    data.jobs.forEach((j) => ensureInstallationProofTask(data, j));
    migrateReturns(data);
    data.productRequests = data.productRequests || [];
    data.jobs.forEach((j) => {
      j.extraItems = j.extraItems || [];
      initializeBillingBasis(data, j);
    });
    data.version = 10;
    return data;
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(parsed.version))
          return normalizeState(parsed);
      }
    } catch (e) {}
    return normalizeState(initialState());
  }
  const EMPTY_COLLECTIONS = [
    "leads",
    "jobs",
    "products",
    "quotes",
    "quoteEmailEvents",
    "tasks",
    "stockMovements",
    "pickLists",
    "returns",
    "suppliers",
    "purchaseOrders",
    "invoices",
    "payments",
    "chaseActivities",
    "logs",
    "notifications",
    "conversations",
    "messages",
    "productRequests",
  ];
  const staffToUsers = (staff) =>
    staff.map((m) => {
      const name =
        m.full_name || String(m.email || "").split("@")[0] || "Staff";
      return {
        id: m.id,
        authId: m.id,
        name,
        email: m.email || "",
        role: m.role_key,
        status: "Active",
        phone: "",
        lastLogin: "Never",
        avatar: initials(name),
      };
    });
  function loadFromCloud() {
    const base = {
      version: 10,
      session: null,
      users: staffToUsers(cloud.staff),
    };
    EMPTY_COLLECTIONS.forEach((k) => (base[k] = []));
    return normalizeState({ ...base, ...cloud.data });
  }
  let state = cloud ? loadFromCloud() : load();
  cloud?.store.baseline?.(state);
  function connectViewer(viewer) {
    if (!viewer) return null;
    if (cloud) {
      let user = state.users.find((candidate) => candidate.id === viewer.id);
      if (!user) {
        user = { id: viewer.id, phone: "", lastLogin: "Never" };
        state.users.push(user);
      }
      Object.assign(user, {
        authId: viewer.id,
        name: viewer.name,
        email: viewer.email,
        role: viewer.role,
        status: "Active",
        avatar: viewer.initials || initials(viewer.name),
      });
      return user;
    }
    const email = String(viewer.email || "").toLowerCase();
    let user =
      state.users.find(
        (candidate) => candidate.email.toLowerCase() === email,
      ) ||
      (viewer.role === "super_admin"
        ? designatedOwner()
        : state.users.find(
            (candidate) =>
              candidate.role === viewer.role &&
              candidate.role !== "super_admin" &&
              candidate.email.endsWith("@demo.com"),
          ));
    if (!user) {
      user = { id: uid("user"), phone: "", lastLogin: "Never" };
      state.users.push(user);
    }
    user.authId = viewer.id;
    user.name = viewer.name;
    user.email = viewer.email;
    user.role = viewer.role;
    user.status = "Active";
    user.avatar = viewer.initials || initials(viewer.name);
    delete user.password;
    return user;
  }
  const authenticatedUser = connectViewer(initialViewer);
  if (authenticatedUser) {
    state.session = {
      userId: authenticatedUser.id,
      role: authenticatedUser.role,
    };
  }
  let ui = {
    page: "dashboard",
    mobileMenu: false,
    drawer: null,
    modal: null,
    child: null,
    leadTab: "details",
    leadId: null,
    jobId: null,
    jobTab: "overview",
    billingTab: "Invoices",
    purchasingTab: "Purchase Orders",
    calendarView: "Agenda",
    taskFilter: "All",
    jobFilter: "All",
    leadStatus: "Open",
    leadStage: "All",
    leadPriority: "All",
    leadSearch: "",
    inventorySearch: "",
    logResult: "All",
    logSearch: "",
    quoteDraft: null,
    scanPickId: null,
    scanMessage: "",
    loginEmail: "admin@demo.com",
    loginPassword: "demo123",
    loginError: "",
    accessTarget: "all",
    accessView: "Modules",
    chatDockOpen: false,
    chatThreadUserId: null,
    chatSelectedUserId: null,
    chatSearch: "",
    chatMessage: "",
    chatAttachmentDrafts: [],
  };
  let mediaStream = null,
    toastTimer = null;
  const currentUser = () =>
    state.users.find((u) => u.id === state.session?.userId) || null;
  const isImpersonating = () => Boolean(state.session?.impersonatorId);
  const isMasterSession = () =>
    hostedOwnerMode()
      ? Boolean(
          accountSnapshot?.context.profile.role === "super_admin" &&
          accountSnapshot.context.modules.some(
            (module) =>
              module.key === "master_control" && module.can_view === true,
          ) &&
          state.session &&
          !accessFailure,
        )
      : state.session?.role === "super_admin" &&
        !isImpersonating() &&
        currentUser()?.id === designatedOwner()?.id &&
        ownerAuthenticated();
  const actorUser = () =>
    state.users.find(
      (u) => u.id === (state.session?.impersonatorId || state.session?.userId),
    ) || null;
  let cloudDirty = false,
    cloudFlushing = null,
    cloudTimer = null,
    cloudError = "";
  function flushCloud() {
    if (cloudFlushing) return cloudFlushing;
    if (!cloudDirty) return Promise.resolve(true);
    cloudFlushing = (async () => {
      try {
        while (cloudDirty) {
          cloudDirty = false;
          try {
            await cloud.store.sync(state);
            cloudError = "";
          } catch (e) {
            cloudDirty = true;
            cloudError = e.message || "Request failed";
            return false;
          }
        }
        return true;
      } finally {
        cloudFlushing = null;
      }
    })();
    return cloudFlushing;
  }
  const save = () => {
    if (identityChanging) return;
    syncInventoryAlerts();
    if (cloud) {
      cloudDirty = true;
      clearTimeout(cloudTimer);
      cloudTimer = setTimeout(async () => {
        if (!(await flushCloud()))
          toast(
            `Not saved to Supabase: ${cloudError}. Your changes are kept; retry by saving again.`,
            "error",
          );
        else void jobApprovals?.refresh();
      }, 400);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("Browser storage is unavailable.", "error");
    }
  };
  const commit = (msg, type = "success") => {
    save();
    render();
    if (!cloud) {
      if (msg) toast(msg, type);
      return;
    }
    clearTimeout(cloudTimer);
    flushCloud().then((ok) => {
      if (ok) {
        void jobApprovals?.refresh();
        if (msg) toast(msg, type);
      } else
        toast(
          `Not saved to Supabase: ${cloudError}. Your changes are kept on screen; try again.`,
          "error",
        );
    });
  };
  function toast(message, type = "success") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `${icon(type === "error" ? "x" : "check")}<div><strong>${type === "error" ? "Could not complete" : "Updated"}</strong><div class="small" style="margin-top:3px;color:#e7edf6">${esc(message)}</div></div>`;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }
  function log(action, entity, reference, summary, result = "Success") {
    state.logs.unshift({
      id: uid("log"),
      action,
      entity,
      reference,
      summary,
      actorRole: state.session?.impersonatorId
        ? "super_admin"
        : currentUser()?.role,
      impersonationSessionId:
        accountSnapshot?.context.impersonation?.id || null,
      userId:
        state.session?.impersonatorId || state.session?.userId || "system",
      actingAsUserId: state.session?.impersonatorId
        ? state.session.userId
        : null,
      createdAt: now(),
      result,
    });
  }
  function notify(title, body, page) {
    state.notifications.unshift({
      id: uid("note"),
      title,
      body,
      read: false,
      page,
      createdAt: now(),
    });
  }
  function userName(id) {
    const u = state.users.find((x) => x.id === id);
    if (u?.role === "super_admin" && state.session?.role !== "super_admin")
      return "System";
    return u?.name || "Unassigned";
  }
  const ROLE_LABELS = {
    super_admin: "Super Admin",
    admin: "Admin",
    manager: "Manager",
    installer: "Installer",
  };
  const roleLabel = (role) =>
    ROLE_LABELS[role] || String(role || "").replace(/_/g, " ");
  function jobOf(id) {
    return state.jobs.find((j) => j.id === id);
  }
  function leadOf(id) {
    return state.leads.find((l) => l.id === id);
  }
  function quoteOf(id) {
    return state.quotes.find((q) => q.id === id);
  }
  function tone(s) {
    s = String(s || "").toLowerCase();
    if (/accepted|paid|completed|won|active|processed|in stock|ready/.test(s))
      return "green";
    if (
      /urgent|overdue|rejected|lost|blocked|denied|out of stock|damaged/.test(s)
    )
      return "red";
    if (/high|pending|partial|shortage|warning|ordered|draft/.test(s))
      return "amber";
    if (
      /sent|progress|picking|contacted|scheduled|new|invited|quotation/.test(s)
    )
      return "blue";
    return "";
  }
  const badge = (s) => `<span class="badge ${tone(s)}">${esc(s)}</span>`;

  const NAV = [
    {
      label: "Overview",
      page: "dashboard",
      icon: "dashboard",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Workspace",
    },
    {
      label: "Master Control",
      page: "master",
      icon: "shield",
      roles: ["super_admin"],
      section: "Workspace",
    },
    {
      label: "Chat",
      page: "chat",
      icon: "chat",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Workspace",
    },
    {
      label: "Leads",
      page: "leads",
      icon: "users",
      roles: ["super_admin", "admin", "manager"],
      section: "Sales",
    },
    {
      label: "Contacts",
      page: "contacts",
      icon: "contact",
      roles: ["super_admin", "admin", "manager"],
      section: "Sales",
    },
    {
      label: "Quotes",
      page: "quotes",
      icon: "file",
      roles: ["super_admin", "admin", "manager"],
      section: "Sales",
    },
    {
      label: "Jobs",
      page: "jobs",
      icon: "briefcase",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Operations",
    },
    {
      label: "Tasks",
      page: "tasks",
      icon: "tasks",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Operations",
    },
    {
      label: "Calendar",
      page: "calendar",
      icon: "calendar",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Operations",
    },
    {
      label: "Inventory",
      page: "inventory",
      icon: "box",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Warehouse",
    },
    {
      label: "Picking & Scan",
      page: "picking",
      icon: "scan",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Warehouse",
    },
    {
      label: "Returns",
      page: "returns",
      icon: "undo",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Warehouse",
    },
    {
      label: "Purchasing",
      page: "purchasing",
      icon: "truck",
      roles: ["super_admin", "admin", "manager"],
      section: "Warehouse",
    },
    {
      label: "Billing",
      page: "billing",
      icon: "receipt",
      roles: ["super_admin", "admin", "manager"],
      section: "Finance",
    },
    {
      label: "Reports",
      page: "reports",
      icon: "chart",
      roles: ["super_admin", "admin", "manager"],
      section: "Finance",
    },
    {
      label: "Users",
      page: "users",
      icon: "settings",
      roles: ["super_admin", "admin", "manager"],
      section: "Management",
    },
    {
      label: "Email Configuration",
      page: "email",
      icon: "settings",
      roles: ["super_admin", "admin", "manager"],
      section: "Management",
    },
    {
      label: "Audit Logs",
      page: "logs",
      icon: "shield",
      roles: ["super_admin", "admin"],
      section: "Management",
    },
    {
      label: "Profile",
      page: "profile",
      icon: "contact",
      roles: ["super_admin", "admin", "manager", "installer"],
      section: "Account",
    },
  ];
  const PAGE_TITLES = {
    dashboard: "Overview",
    master: "Master Control",
    chat: "Chat",
    leads: "Leads",
    contacts: "Contacts",
    quotes: "Quotes",
    jobs: "Jobs",
    tasks: "Tasks",
    calendar: "Calendar",
    inventory: "Inventory",
    picking: "Picking & Scan",
    returns: "Returns",
    purchasing: "Purchasing",
    email: "Email Configuration",
    billing: "Billing",
    reports: "Reports",
    users: "Users",
    logs: "Audit Logs",
    profile: "Profile",
  };
  const leadStages = [
    "New Lead",
    "Contacted",
    "Appointment Booked",
    "Quote Sent",
    "Negotiation",
    "Won",
    "Lost",
  ];
  const jobStatuses = [
    "Confirmed",
    "Stock Shortage",
    "Picking",
    "Ready for Collection",
    "Collected",
    "Installation Scheduled",
    "Installation in Progress",
    "Repair Scheduled",
    "Repair in Progress",
    "Return Pending",
    "Completed",
    "On Hold",
  ];
  const taskStatuses = [
    "Pending",
    "In Progress",
    "Blocked",
    "Completed",
    "Not applicable",
  ];
  const CAPABILITIES = [
    {
      key: "lead_manage",
      label: "Create and update leads",
      group: "Sales",
      detail: "Create leads and convert accepted work to jobs.",
      actions: ["new-lead", "create-lead", "convert-lead"],
    },
    {
      key: "quote_manage",
      label: "Create and revise quotations",
      group: "Sales",
      detail:
        "Add products, custom lines, edit drafts and change quote status.",
      actions: [
        "add-quote-product",
        "add-custom-line",
        "remove-quote-line",
        "save-quote",
        "edit-quote",
        "ready-quote",
        "quote-status",
      ],
    },
    {
      key: "quote_send",
      label: "Send quotations",
      group: "Sales",
      detail: "Open the sending flow and confirm quotation email delivery.",
      actions: ["send-quote", "confirm-send-quote"],
    },
    {
      key: "quote_download",
      label: "Download quotations",
      group: "Sales",
      detail: "Download and share customer-ready quotation files.",
      actions: ["download-quote"],
    },
    {
      key: "job_manage",
      label: "Update jobs and installations",
      group: "Operations",
      detail:
        "Change job status, confirm collection and complete installations.",
      actions: [
        "job-status",
        "confirm-collection",
        "complete-installation",
        "create-quote-job",
        "edit-job",
        "save-job",
        "admin-job-status",
        "reopen-job",
        "repair-collection",
        "request-product",
        "approve-product",
        "reject-product",
        "cancel-product-request",
      ],
    },
    {
      key: "task_manage",
      label: "Create and update tasks",
      group: "Operations",
      detail: "Create, start and complete operational tasks.",
      actions: [
        "new-task",
        "create-task",
        "task-start",
        "task-complete",
        "admin-task-status",
      ],
    },
    {
      key: "chat_send",
      label: "Send chat messages and attachments",
      group: "Workspace",
      detail: "Talk with active staff and attach files in conversations.",
      actions: ["send-chat", "chat-attach"],
    },
    {
      key: "inventory_adjust",
      label: "Adjust inventory",
      group: "Warehouse",
      detail: "Post stock increases, reductions, damage and write-offs.",
      actions: ["adjust-stock", "post-stock"],
    },
    {
      key: "picking_scan",
      label: "Scan and pick stock",
      group: "Warehouse",
      detail: "Use barcode or camera scanning against Pick Lists.",
      actions: [
        "select-pick",
        "scan-barcode",
        "quick-scan",
        "toggle-camera",
        "confirm-pickup-location",
        "confirm-addition-location",
        "scan-addition",
      ],
    },
    {
      key: "returns_process",
      label: "Process returns",
      group: "Warehouse",
      detail: "Receive and reconcile unused or damaged products.",
      actions: [
        "return-received",
        "process-return",
        "start-return",
        "scan-return",
        "submit-return",
        "arrange-return",
        "collect-return",
        "deliver-return",
        "client-return-received",
        "remove-return-item",
        "reconcile-return",
        "cancel-return",
        "self-collect-return",
      ],
    },
    {
      key: "purchasing_receive",
      label: "Receive purchase orders",
      group: "Warehouse",
      detail: "Post remaining supplier goods into inventory.",
      actions: ["receive-po"],
    },
    {
      key: "billing_manage",
      label: "Manage billing and payments",
      group: "Finance",
      detail: "Create invoices, record payments and send reminders.",
      actions: [
        "new-invoice",
        "create-invoice",
        "record-payment",
        "save-payment",
        "send-reminder",
        "save-billing-basis",
        "finalize-job-billing",
      ],
    },
    {
      key: "user_manage",
      label: "Manage staff accounts",
      group: "Management",
      detail: "Create, edit, disable, delete and update passwords.",
      actions: [
        "new-user",
        "create-user",
        "toggle-user",
        "reset-password",
        "edit-user",
        "save-user-edit",
        "change-password",
        "save-user-password",
        "delete-user",
        "confirm-delete-user",
        "impersonate-user",
      ],
    },
  ];
  const ACTION_CAPABILITY = Object.fromEntries(
    CAPABILITIES.flatMap((c) => c.actions.map((a) => [a, c.key])),
  );
  const CAPABILITY_ROLES = {
    lead_manage: ["admin", "manager"],
    quote_manage: ["admin", "manager"],
    quote_send: ["admin", "manager"],
    quote_download: ["admin", "manager"],
    job_manage: ["admin", "manager", "installer"],
    task_manage: ["admin", "manager", "installer"],
    chat_send: ["admin", "manager", "installer"],
    inventory_adjust: ["admin", "manager"],
    picking_scan: ["admin", "manager", "installer"],
    returns_process: ["admin", "manager", "installer"],
    purchasing_receive: ["admin", "manager"],
    billing_manage: ["admin", "manager"],
    user_manage: ["admin", "manager"],
  };

  function permissionValue(userId, kind, key) {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return false;
    if (user.role === "super_admin")
      return user.id === designatedOwner()?.id && isMasterSession();
    if (state.accessControl.locks?.[kind]?.[key] === true) return false;
    const personal = state.accessControl.users[userId]?.[kind];
    if (typeof personal?.[key] === "boolean") return personal[key];
    if (state.accessControl.users[userId]?.fullAccess === true)
      return key !== "master";
    const global = state.accessControl.global[kind];
    if (typeof global?.[key] === "boolean") return global[key];
    if (kind === "pages")
      return NAV.some((n) => n.page === key && n.roles.includes(user.role));
    return (CAPABILITY_ROLES[key] || []).includes(user.role);
  }
  function permissionSource(userId, kind, key) {
    const personal = state.accessControl.users[userId]?.[kind];
    if (typeof personal?.[key] === "boolean") return "User override";
    const global = state.accessControl.global[kind];
    if (typeof global?.[key] === "boolean") return "All-user rule";
    return kind === "pages" ? "Role default" : "Default access";
  }
  function hasCapability(key) {
    if (accountSnapshot) {
      if (accessFailure || !state.session) return false;
      const capabilities = {
        lead_manage: ["leads", "update"],
        quote_manage: ["quotations", "update"],
        quote_send: ["quotations", "update"],
        quote_download: ["quotations", "export"],
        job_manage: ["jobs", "update"],
        task_manage: ["tasks", "update"],
        chat_send: ["chat", "send"],
        inventory_adjust: ["inventory", "update"],
        picking_scan: ["warehouse", "update"],
        returns_process: ["warehouse", "update"],
        purchasing_receive: ["purchasing", "update"],
        billing_manage: ["billing", "update"],
        user_manage: ["users", "update"],
      };
      const pair = capabilities[key];
      if (!pair) return false;
      const module = accountSnapshot.context.modules.find(
        (m) => m.key === pair[0],
      );
      if (key === "user_manage")
        return Object.entries(module || {}).some(
          ([k, v]) => k !== "can_view" && k.startsWith("can_") && v === true,
        );
      return module?.[`can_${pair[1]}`] === true;
    }
    if (
      isInstaller() &&
      !state.accessControl.users[state.session?.userId]?.fullAccess &&
      ![
        "job_manage",
        "task_manage",
        "chat_send",
        "picking_scan",
        "returns_process",
      ].includes(key)
    )
      return false;
    return (
      isMasterSession() ||
      permissionValue(state.session?.userId, "capabilities", key)
    );
  }
  function canRunAction(action, el = null) {
    if (identityChanging) return false;
    if (!accountSnapshot) {
      const capability = ACTION_CAPABILITY[action];
      return !capability || hasCapability(capability);
    }
    const checks = {
      "workflow-create": ["jobs", "create"],
      "new-lead": ["leads", "create"],
      "create-lead": ["leads", "create"],
      "convert-lead": ["jobs", "create"],
      "create-quote-job": ["jobs", "create"],
      "new-task": ["tasks", el?.dataset.id ? "update" : "create"],
      "create-task": ["tasks", ui.modal?.taskId ? "update" : "create"],
      "save-quote": [
        "quotations",
        ui.quoteDraft?.editingId ? "update" : "create",
      ],
      "add-quote-product": [
        "quotations",
        ui.quoteDraft?.editingId ? "update" : "create",
      ],
      "add-custom-line": [
        "quotations",
        ui.quoteDraft?.editingId ? "update" : "create",
      ],
      "remove-quote-line": [
        "quotations",
        ui.quoteDraft?.editingId ? "update" : "create",
      ],
      "new-invoice": ["billing", "create"],
      "create-invoice": ["billing", "create"],
      "new-po": ["purchasing", "create"],
      "save-po": ["purchasing", "create"],
      "new-supplier": ["purchasing", "create"],
      "save-supplier": ["purchasing", "create"],
      "approve-product": ["jobs", "approve"],
      "reject-product": ["jobs", "approve"],
      "save-email-config": ["settings", "update"],
      "generate-report": ["reports", "view"],
      "preview-report": ["reports", "view"],
      "export-report": ["reports", "export"],
      "chat-attach": ["chat", "attach"],
    };
    const pair = checks[action];
    if (pair)
      return (
        accountSnapshot.context.modules.find((m) => m.key === pair[0])?.[
          `can_${pair[1]}`
        ] === true
      );
    const capability = ACTION_CAPABILITY[action];
    return !capability || hasCapability(capability);
  }
  function visiblePage(page) {
    if (!allowedPage(page)) return false;
    if (!accountSnapshot || ["profile", "master"].includes(page)) return true;
    const moduleKey =
      {
        quotes: "quotations",
        picking: "warehouse",
        returns: "warehouse",
        contacts: "leads",
        calendar: "tasks",
        email: "quotations",
        logs: "settings",
      }[page] || page;
    return (
      accountSnapshot.context.modules.find((m) => m.key === moduleKey)
        ?.tab_visible !== false
    );
  }
  function allowedPage(page) {
    if (accountSnapshot) {
      if (accessFailure || !state.session) return false;
      if (page === "master") return isMasterSession();
      if (page === "users")
        return usersModule(accountSnapshot.context)?.can_view === true;
      if (page === "profile") return true;
      const moduleKey =
        {
          quotes: "quotations",
          picking: "warehouse",
          returns: "warehouse",
          contacts: "leads",
          calendar: "tasks",
          email: "quotations",
          logs: "settings",
        }[page] || page;
      const module = accountSnapshot.context.modules.find(
        (module) =>
          module.key === moduleKey ||
          module.route === page ||
          module.route === `/crm/${page}`,
      );
      return module?.can_view === true;
    }
    const user = currentUser();
    if (!user || (user.role === "super_admin" && !isMasterSession()))
      return false;
    if (page === "master") return isMasterSession();
    if (isMasterSession()) return NAV.some((n) => n.page === page);
    if (
      state.accessControl.users[user.id]?.fullAccess !== true &&
      isInstaller() &&
      ![
        "dashboard",
        "chat",
        "jobs",
        "tasks",
        "calendar",
        "inventory",
        "picking",
        "returns",
        "profile",
      ].includes(page)
    )
      return false;
    return NAV.some(
      (n) => n.page === page && permissionValue(user.id, "pages", page),
    );
  }

  function firstAllowedPage() {
    return NAV.find((n) => allowedPage(n.page))?.page || "profile";
  }
  function route(page, keepContext = false) {
    inventoryControls?.stopCamera();
    if (!allowedPage(page)) page = firstAllowedPage();
    if (!keepContext) {
      ui.workContext = null;
      ui.workLeadId = "";
    }
    ui.page = page;
    const path = modulePath(page, isMasterEntry());
    if (location.pathname !== path) history.pushState(null, "", path);
    ui.mobileMenu = false;
    ui.drawer = null;
    ui.modal = null;
    ui.child = null;
    if (page === "chat") {
      ui.chatDockOpen = false;
      ui.chatThreadUserId = null;
    }
    stopCamera();
    render();
  }
  function header(eyebrow, title, subtitle, actions = "") {
    return `<div class="page-header"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
  }
  function metric(label, value, detail, iconName = "chart", toneClass = "") {
    return `<div class="card metric"><div class="icon-box ${toneClass}">${icon(iconName)}</div><div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="detail">${esc(detail)}</div></div></div>`;
  }
  function sectionTitle(title, hint, action = "") {
    return `<div class="section-title"><div><h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ""}</div>${action}</div>`;
  }
  function captureView() {
    const a = document.activeElement;
    return {
      focus: a?.dataset?.focus || null,
      start: a?.selectionStart,
      end: a?.selectionEnd,
      scroll: $(".content")?.scrollTop || 0,
      modal: $(".modal-body")?.scrollTop || 0,
    };
  }
  function restoreView(v) {
    const c = $(".content");
    if (c) c.scrollTop = v.scroll;
    const m = $(".modal-body");
    if (m) m.scrollTop = v.modal;
    if (v.focus) {
      const el = root.querySelector(`[data-focus="${CSS.escape(v.focus)}"]`);
      if (el) {
        el.focus();
        try {
          el.setSelectionRange(v.start, v.end);
        } catch (e) {}
      }
    }
  }
  function applyActionPermissions() {
    $$("[data-action]").forEach((el) => {
      if (!canRunAction(el.dataset.action, el)) {
        el.disabled = true;
        el.setAttribute("aria-disabled", "true");
        el.title = "Disabled by access control";
      }
    });
    $$("[data-page]").forEach((el) => {
      if (!allowedPage(el.dataset.page)) el.hidden = true;
    });
    if (!canRunAction("save-quote"))
      $$("[data-draft-field],[data-line-field]").forEach(
        (el) => (el.disabled = true),
      );
    if (!hasCapability("job_manage"))
      $$("[data-used-item],[data-photo-job]").forEach(
        (el) => (el.disabled = true),
      );
    if (!hasCapability("chat_send"))
      $$("[data-chat-message],[data-chat-files]").forEach(
        (el) => (el.disabled = true),
      );
    if (!hasCapability("picking_scan")) {
      const input = $("#barcode-input");
      if (input) input.disabled = true;
    }
  }
  function render() {
    if (lifecycle.disposed) return;
    if (accessFailure) {
      $("#app").innerHTML =
        `<main class="crm-loading"><div><h1>Access could not be verified</h1><p role="alert">${esc(accessFailure)}</p><a class="btn" href="/login">Return to sign in</a></div></main>`;
      $("#overlay").innerHTML = "";
      return;
    }
    guardSession();
    if (syncInventoryAlerts()) save();
    const view = captureView();
    const app = $("#app");
    if (!state.session || !currentUser()) {
      if (hostedOwnerMode()) {
        // No session: Supabase Auth on /login is the only entry point.
        app.innerHTML =
          '<div class="crm-loading" role="status">Redirecting to sign in…</div>';
        location.assign("/login");
        return;
      }
      app.innerHTML = isMasterEntry() ? renderOwnerLogin() : renderLogin();
      $("#overlay").innerHTML = "";
    } else {
      if (!allowedPage(ui.page)) ui.page = firstAllowedPage();
      app.innerHTML = renderShell();
      $("#overlay").innerHTML =
        renderOverlays() +
        (accountControls?.renderModal() || "") +
        (masterControls?.renderModal() || "") +
        (inventoryControls?.renderModal() || "") +
        (workflowControls?.renderModal() || "");
    }
    requestAnimationFrame(() => {
      restoreView(view);
      applyActionPermissions();
      inventoryControls?.hydrateImages();
      hydrateProofMedia();
      hydrateReturnForms();
      $$("[data-chat-scroll]").forEach(
        (el) => (el.scrollTop = el.scrollHeight),
      );
    });
  }

  function accessBucket(target, kind, create = false) {
    if (target === "all") return state.accessControl.global[kind];
    if (create && !state.accessControl.users[target])
      state.accessControl.users[target] = { pages: {}, capabilities: {} };
    if (create && !state.accessControl.users[target][kind])
      state.accessControl.users[target][kind] = {};
    return state.accessControl.users[target]?.[kind] || {};
  }
  function setAccessRule(target, kind, key, value) {
    if (
      !isMasterSession() ||
      (target !== "all" &&
        (!state.users.some((u) => u.id === target) ||
          target === designatedOwner()?.id)) ||
      !["pages", "capabilities"].includes(kind)
    )
      return false;
    const bucket = accessBucket(target, kind, true);
    bucket[key] = value;
    const subject =
      target === "all" ? "all non-master users" : userName(target);

    return true;
  }
  function clearAccessRules(target, kind, key = null) {
    if (
      !isMasterSession() ||
      (target !== "all" &&
        (!state.users.some((u) => u.id === target) ||
          target === designatedOwner()?.id)) ||
      !["pages", "capabilities"].includes(kind)
    )
      return false;
    const bucket = accessBucket(target, kind, true);
    if (key) delete bucket[key];
    else Object.keys(bucket).forEach((k) => delete bucket[k]);
    const subject =
      target === "all" ? "all non-master users" : userName(target);
    return true;
  }
  function bulkAccessRules(target, kind, value) {
    if (
      !isMasterSession() ||
      (target !== "all" &&
        (!state.users.some((u) => u.id === target) ||
          target === designatedOwner()?.id)) ||
      !["pages", "capabilities"].includes(kind)
    )
      return false;
    const keys =
        kind === "pages"
          ? NAV.filter((n) => n.page !== "master").map((n) => n.page)
          : CAPABILITIES.map((c) => c.key),
      bucket = accessBucket(target, kind, true);
    keys.forEach((key) => (bucket[key] = value));
    const subject =
      target === "all" ? "all non-master users" : userName(target);
    return true;
  }
  function permissionRow(item, kind) {
    const target = ui.accessTarget,
      raw = accessBucket(target, kind)[item.key],
      user = target === "all" ? null : state.users.find((u) => u.id === target);
    const effective =
      target === "all"
        ? typeof raw === "boolean"
          ? raw
          : true
        : permissionValue(user?.id, kind, item.key);
    const source =
      typeof raw === "boolean"
        ? target === "all"
          ? "All-user rule"
          : "User override"
        : target === "all"
          ? "Default / role access"
          : permissionSource(user?.id, kind, item.key);
    return `<div class="permission-row"><span class="icon-box ${effective ? "green" : "red"}">${icon(effective ? "check" : "x")}</span><div class="grow"><strong>${esc(item.label)}</strong><div class="detail">${esc(item.detail || item.section || "CRM module")} · ${esc(source)}</div></div><div class="row wrap gap6"><button class="btn ${effective ? "success" : "ghost"} sm" data-action="set-access" data-kind="${kind}" data-key="${item.key}" data-value="true">Enable</button><button class="btn ${!effective ? "danger" : "ghost"} sm" data-action="set-access" data-kind="${kind}" data-key="${item.key}" data-value="false">Disable</button>${typeof raw === "boolean" ? `<button class="btn ghost sm" data-action="clear-access" data-kind="${kind}" data-key="${item.key}">Default</button>` : ""}</div></div>`;
  }
  // Supabase owns hosted sessions. Operational prototype records remain browser-local.
  const HOSTED_OWNER_KEY = "ibs-hosted-owner-v1";
  let hostedOwner =
      initialViewer?.role === "super_admin" && verifiedOwnerId
        ? {
            ...initialViewer,
            authorized: true,
            expiresAt: Date.now() + 5 * 60 * 1000,
            verifiedAt: Date.now(),
          }
        : null,
    hostedCheck = null,
    hostedEpoch = 0;
  function hostedOwnerMode() {
    return Boolean(authBackend?.enabled);
  }
  function hostedOwnerActive() {
    return !!hostedOwner?.authorized && Date.now() < hostedOwner.expiresAt;
  }
  async function ownerRequest() {
    throw Error(
      "Direct token requests are disabled; Supabase manages the session cookie.",
    );
  }
  async function validateHostedTokens(viewer) {
    if (
      !viewer ||
      viewer.role !== "super_admin" ||
      !(await authBackend.ownerAccess())
    )
      throw Error(
        "Only the verified Super Admin account may use these controls.",
      );
    return {
      ...viewer,
      expiresAt: Date.now() + 5 * 60 * 1000,
      authorized: true,
      verifiedAt: Date.now(),
      userId: viewer.id,
    };
  }
  function persistHostedOwner(session) {
    hostedOwner = session;
  }
  function forgetHostedOwner() {
    hostedEpoch++;
    hostedOwner = null;
    hostedCheck = null;
    try {
      sessionStorage.removeItem(HOSTED_OWNER_KEY);
    } catch (e) {}
  }
  async function revokeHostedToken() {
    if (authBackend?.enabled) await authBackend.signOut();
  }
  async function loginHostedOwner(email, password) {
    const epoch = hostedEpoch;
    try {
      const verified = await validateHostedTokens(
        await authBackend.reauthenticate(String(email).trim(), password),
      );
      if (epoch !== hostedEpoch) {
        await revokeHostedToken();
        return false;
      }
      persistHostedOwner(verified);
      completeLogin(connectViewer(verified));
      return true;
    } catch (e) {
      await revokeHostedToken();
      forgetHostedOwner();
      throw e;
    }
  }
  async function ensureHostedOwner(fresh = false) {
    if (accountSnapshot) return isMasterSession();
    if (!hostedOwnerMode()) return true;
    if (
      !fresh &&
      hostedOwnerActive() &&
      Date.now() - hostedOwner.verifiedAt < 15000
    )
      return true;
    if (hostedCheck) return hostedCheck;
    const epoch = hostedEpoch;
    hostedCheck = (async () => {
      try {
        const verified = await validateHostedTokens(
          await authBackend.restore(),
        );
        if (epoch !== hostedEpoch) return false;
        persistHostedOwner(verified);
        return true;
      } catch (e) {
        forgetHostedOwner();
        ui.ownerError = e.message;
        return false;
      } finally {
        hostedCheck = null;
      }
    })();
    return hostedCheck;
  }
  async function bootstrapHostedOwner() {
    ui.ownerRestoring = true;
    $("#app").innerHTML =
      '<div class="crm-loading" role="status">Checking your session…</div>';
    try {
      if (await ensureHostedOwner(true)) {
        completeLogin(designatedOwner());
      } else {
        state.session = null;
        await revokeHostedToken();
      }
    } finally {
      ui.ownerRestoring = false;
      save();
      render();
    }
  }
  async function changeHostedOwnerPassword(password, confirm, current) {
    if (!hostedOwnerActive() || !isMasterSession())
      throw Error("Super Admin sign-in required.");
    if (password.length < 12 || password !== confirm)
      throw Error(
        "Use at least 12 characters and enter the same password twice.",
      );
    const verified = await validateHostedTokens(
      await authBackend.reauthenticate(currentUser().email, current),
    );
    await authBackend.updatePassword(password);
    persistHostedOwner(verified);
  }

  // Offline demo only. Hosted (Supabase) sessions never depend on the URL.
  function isMasterEntry() {
    return (
      !hostedOwnerMode() &&
      (location.pathname === MASTER_PATH ||
        location.pathname.startsWith(MASTER_PATH + "/"))
    );
  }
  function designatedOwner(data = state) {
    if (hostedOwnerMode())
      return data.users.find(
        (u) => u.role === "super_admin" && u.id === verifiedOwnerId,
      );
    return data.users.find(
      (u) =>
        u.role === "super_admin" &&
        String(u.email).toLowerCase() === OWNER_EMAIL,
    );
  }
  function normalizeOwner(data) {
    if (hostedOwnerMode()) return data;
    let owner =
      data.users.find((u) => String(u.email).toLowerCase() === OWNER_EMAIL) ||
      data.users.find((u) => u.role === "super_admin");
    if (!owner) {
      owner = {
        id: "u-super-admin",
        name: "Workspace Owner",
        role: "super_admin",
        email: OWNER_EMAIL,
        avatar: "SA",
        status: "Active",
        lastLogin: "Never",
      };
      data.users.unshift(owner);
    }
    for (const u of data.users) {
      if (u !== owner && u.role === "super_admin") {
        u.role = "admin";
        u.status = "Blocked";
      }
    }
    if (owner.email !== OWNER_EMAIL) {
      owner.name = "Workspace Owner";
      owner.avatar = "SA";
    }
    owner.email = OWNER_EMAIL;
    owner.role = "super_admin";
    owner.status = "Active";
    delete owner.password;
    return data;
  }
  function ownerAuthenticated() {
    if (hostedOwnerMode()) return hostedOwnerActive();
    try {
      return (
        !!state.masterAuth?.version &&
        sessionStorage.getItem(MASTER_SESSION_KEY) === state.masterAuth.version
      );
    } catch (e) {
      return false;
    }
  }
  function guardSession() {
    if (accountSnapshot) {
      if (accountSnapshot.context.profile.status !== "active" || accessFailure)
        state.session = null;
      return;
    }
    const u = currentUser();
    if (!state.session) return;
    if (!u || u.status !== "Active" || state.session.role !== u.role) {
      state.session = null;
      return;
    }
    const masterContext =
      u.role === "super_admin" || state.session.impersonatorId;
    if (masterContext) {
      const owner = designatedOwner();
      if (
        !ownerAuthenticated() ||
        !owner ||
        (u.role === "super_admin" && u.id !== owner.id) ||
        (state.session.impersonatorId &&
          state.session.impersonatorId !== owner.id)
      )
        state.session = null;
    }
  }
  function clearOwnerSession() {
    forgetHostedOwner();
    try {
      sessionStorage.removeItem(MASTER_SESSION_KEY);
    } catch (e) {}
  }
  async function ownerHash(password, salt) {
    if (!crypto.subtle)
      throw Error(
        "Password setup needs HTTPS, localhost, or a browser that supports secure local files.",
      );
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
      ),
      bytes = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          iterations: 180000,
          salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)),
        },
        key,
        256,
      );
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  }
  async function setOwnerPassword(password, confirmation, current = "") {
    if (hostedOwnerMode())
      return changeHostedOwnerPassword(password, confirmation, current);
    if (!isMasterEntry() || (!isMasterSession() && state.masterAuth))
      throw Error(
        "Sign in through the Super Admin portal to change its password.",
      );
    if (password.length < 12 || password !== confirmation)
      throw Error(
        "Use at least 12 characters and enter the same password twice.",
      );
    if (
      state.masterAuth &&
      (await ownerHash(current, state.masterAuth.salt)) !==
        state.masterAuth.hash
    )
      throw Error("Current password is incorrect.");
    const salt = btoa(
        String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
      ),
      auth = {
        salt,
        hash: await ownerHash(password, salt),
        version: uid("owner-auth"),
        updatedAt: now(),
      },
      previous = state.masterAuth;
    state.masterAuth = auth;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      sessionStorage.setItem(MASTER_SESSION_KEY, auth.version);
    } catch (e) {
      state.masterAuth = previous;
      throw Error(
        "Browser storage could not save the owner password. Check storage settings and try again.",
      );
    }
    return true;
  }
  function completeLogin(u) {
    ui.workContext = null;
    ui.workLeadId = "";
    ui.globalSearch = "";
    ui.modal = null;
    ui.child = null;
    ui.drawer = null;
    ui.chatSelectedUserId = null;
    ui.chatThreadUserId = null;
    ui.chatDockOpen = false;
    ui.productRequestId = "";
    ui.returnId = null;
    ui.loginPassword = "";
    ui.loginError = "";
    state.session = { userId: u.id, role: u.role };
    u.lastLogin = now();
    log(
      "User signed in",
      "User",
      u.email,
      `${u.name} signed in as ${roleLabel(u.role)}.`,
    );
    ui.page = allowedPage(initialPage) ? initialPage : firstAllowedPage();
    history.replaceState(null, "", modulePath(ui.page, isMasterEntry()));
    ui.masterView = "Overview";
    save();
    render();
  }
  function loginStaff(email, password) {
    // Hosted sign-in happens on /login with Supabase Auth; the offline demo
    // credentials below only exist for the local demo mode.
    if (hostedOwnerMode()) {
      location.assign("/login");
      return false;
    }
    email = String(email).trim().toLowerCase();
    const u = state.users.find((x) => x.email.toLowerCase() === email);
    if (
      !u ||
      password !==
        (u.role === "super_admin" ? u.password : u.password || "demo123") ||
      u.status !== "Active"
    ) {
      ui.loginError = "Email, password or login area is incorrect.";
      log(
        "Sign-in denied",
        "Authentication",
        email,
        "Sign-in rejected by account, credentials or login-area restriction.",
        "Denied",
      );
      save();
      render();
      return false;
    }
    completeLogin(u);
    return true;
  }
  async function loginOwner(email, password) {
    if (hostedOwnerMode()) return loginHostedOwner(email, password);
    if (String(email).trim().toLowerCase() !== OWNER_EMAIL || !state.masterAuth)
      return false;
    const u = designatedOwner();
    if (
      !u ||
      (await ownerHash(password, state.masterAuth.salt)) !==
        state.masterAuth.hash
    ) {
      log(
        "Super Admin sign-in denied",
        "Authentication",
        OWNER_EMAIL,
        "Owner password did not match.",
        "Denied",
      );
      save();
      return false;
    }
    sessionStorage.setItem(MASTER_SESSION_KEY, state.masterAuth.version);
    completeLogin(u);
    return true;
  }

  function ultimateBucket(id) {
    state.accessControl.users[id] ??= { pages: {}, capabilities: {} };
    return state.accessControl.users[id];
  }

  function ultimateAction(a, id, el) {
    if (!isMasterSession()) return false;
    const owner = designatedOwner()?.id,
      staff = state.users.filter((u) => u.id !== owner);
    if (a === "ultimate-lock") {
      const key = el.dataset.key;
      if (!NAV.some((n) => n.page === key && key !== "master")) return false;
      state.accessControl.locks ??= { pages: {}, capabilities: {} };
      state.accessControl.locks.pages ??= {};
      state.accessControl.locks.pages[key] =
        !state.accessControl.locks.pages[key];
    } else if (a === "ultimate-change-role") {
      const u = staff.find((u) => u.id === id),
        role = root.querySelector(`[data-ultimate-role="${id}"]`)?.value;
      if (!u || !["admin", "manager", "installer"].includes(role)) return false;
      u.role = role;
    } else {
      const targets = a.startsWith("ultimate-role-")
        ? staff.filter((u) => u.role === $("#ultimate-role")?.value)
        : staff.filter((u) => u.id === id);
      if (!targets.length) return false;
      for (const u of targets) {
        const bucket = ultimateBucket(u.id);
        if (a.endsWith("grant")) {
          bucket.fullAccess = true;
          bucket.pages = {};
          bucket.capabilities = {};
        } else if (a.endsWith("hide")) {
          bucket.fullAccess = false;
          bucket.pages = Object.fromEntries(
            NAV.filter((n) => n.page !== "master").map((n) => [n.page, false]),
          );
          bucket.capabilities = Object.fromEntries(
            CAPABILITIES.map((c) => [c.key, false]),
          );
        } else if (a.endsWith("reset")) delete state.accessControl.users[u.id];
      }
    }
    save();
    render();
    toast("Owner control applied.");
    return true;
  }

  function resetOwnerDemo() {
    if (!isMasterSession()) return false;
    const owner = JSON.parse(JSON.stringify(designatedOwner())),
      auth = state.masterAuth,
      logs = state.logs.slice(),
      fresh = initialState();
    fresh.users = fresh.users.filter((u) => u.role !== "super_admin");
    fresh.users.unshift(owner);
    fresh.masterAuth = auth;
    state = normalizeState(fresh);
    state.logs = logs;
    state.session = { userId: owner.id, role: "super_admin" };
    log(
      "Demo workspace reset",
      "System",
      "Standalone CRM",
      "Owner reset operational demo data; owner password and audit history retained.",
    );
    ui.page = "master";
    ui.masterView = "Overview";
    save();
    render();
    return true;
  }

  function blankDraft(lead) {
    return {
      editingId: null,
      lines: [],
      customDescription: "Installation and service charges",
      customQuantity: "1",
      customPrice: "250",
      validUntil: new Date(Date.now() + 14 * 86400000)
        .toISOString()
        .slice(0, 10),
      notes:
        "Quotation includes supply, delivery and professional installation unless stated otherwise.",
    };
  }
  function quoteTotals(d) {
    const subtotal = d.lines.reduce(
        (s, x) => s + (Number(x.quantity) || 0) * (Number(x.unitPrice) || 0),
        0,
      ),
      gst = d.lines.reduce(
        (s, x) =>
          s +
          (x.taxable
            ? (Number(x.quantity) || 0) * (Number(x.unitPrice) || 0) * 0.1
            : 0),
        0,
      );
    return { subtotal, gst, total: subtotal + gst };
  }
  function infoFact(label, value) {
    return `<div class="fact"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
  }

  // Tasks are required gates for their linked stage. Existing records are migrated without resetting data.
  function inferredTaskStage(t, j) {
    if (t.jobStage) return t.jobStage;
    if (t.category === "Picking") return "Picking";
    if (t.category === "Collection") return "Ready for Collection";
    if (t.category === "Installation")
      return /schedul|assign.*installer|confirm.*date/i.test(t.title)
        ? "Collected"
        : "Installation in Progress";
    if (t.category === "Return") return "Return Pending";
    if (t.category === "Billing") return "Installation in Progress";
    if (t.category === "Warehouse")
      return /shortage/i.test(t.title) || j?.status === "Stock Shortage"
        ? "Stock Shortage"
        : "Confirmed";
    return j?.status === "Completed"
      ? "Installation in Progress"
      : j?.status || "Confirmed";
  }
  function stageRank(s, j) {
    if (j?.stages?.some((x) => x.id === s))
      return j.stages.findIndex((x) => x.id === s);
    return (
      {
        Confirmed: 0,
        "Stock Shortage": 0,
        Picking: 1,
        "Ready for Collection": 2,
        Collected: 3,
        "Installation Scheduled": 4,
        "Repair Scheduled": 4,
        "Repair in Progress": 5,
        "Installation in Progress": 5,
        "Return Pending": 6,
        Completed: 7,
      }[s] ?? -1
    );
  }
  function activeJobStage(j) {
    return j.status === "On Hold" ? j.resumeStage || "Confirmed" : j.status;
  }
  function linkedJobTasks(j) {
    return state.tasks.filter((t) => t.jobId === j.id);
  }
  function stageBlockers(j, target) {
    if (j.status === "On Hold")
      return linkedJobTasks(j).filter(
        (t) => t.jobStage === "On Hold" && t.status !== "Completed",
      );
    return linkedJobTasks(j).filter(
      (t) =>
        applicableTask(t, j) &&
        t.required !== false &&
        t.status !== "Completed" &&
        (t.jobStage === j.status ||
          stageRank(t.jobStage, j) <= stageRank(activeJobStage(j), j) ||
          target === "Completed"),
    );
  }
  function hasFullStaffAccess() {
    return !!state.accessControl.users[state.session?.userId]?.fullAccess;
  }
  function isInstaller() {
    return currentUser()?.role === "installer" && !hasFullStaffAccess();
  }
  function isStatusAdmin() {
    return (
      ["admin", "manager"].includes(currentUser()?.role) ||
      isMasterSession() ||
      hasFullStaffAccess()
    );
  }
  function ownsJob(j) {
    return !!j && (!isInstaller() || j.installerId === currentUser()?.id);
  }
  function canViewTask(t) {
    return (
      !!t &&
      !!currentUser() &&
      (!isInstaller() ||
        (t.assignedTo === currentUser().id &&
          (t.requestId
            ? canViewProductRequest(requestOf(t.requestId))
            : t.returnId
              ? canViewReturn(returnOf(t.returnId))
              : !t.jobId || ownsJob(jobOf(t.jobId)))))
    );
  }
  function visibleJobTasks(j) {
    return linkedJobTasks(j).filter(canViewTask);
  }
  function workJobId() {
    const c = ui.workContext;
    return c?.page === ui.page && c.jobId && canViewJob(jobOf(c.jobId))
      ? c.jobId
      : "";
  }
  function inWorkJob(jobId) {
    return !workJobId() || workJobId() === jobId;
  }
  function workProducts() {
    const j = jobOf(workJobId());
    return j ? new Set(j.items.map((x) => x.productId)) : null;
  }
  function workInvoices() {
    return state.invoices.filter((x) => inWorkJob(x.jobId));
  }
  function workPayments() {
    const ids = new Set(workInvoices().map((x) => x.id));
    return state.payments.filter((x) => ids.has(x.invoiceId));
  }
  function workPurchaseOrders() {
    const ids = workProducts();
    return state.purchaseOrders.filter(
      (x) =>
        !ids ||
        x.jobId === workJobId() ||
        poLines(x).some((l) => ids.has(l.productId)),
    );
  }
  function visibleNotifications() {
    return [
      ...(jobApprovals?.notifications() || []),
      ...state.notifications,
    ].filter((n) => {
      if (n.resolvedAt) return false;
      if (n.audienceRoles && !n.audienceRoles.includes(currentUser()?.role))
        return false;
      if (!isInstaller()) return true;
      if (!allowedPage(n.page)) return false;
      if (n.taskId)
        return canViewTask(state.tasks.find((t) => t.id === n.taskId));
      if (n.jobId) return ownsJob(jobOf(n.jobId));
      if (n.userId || n.userIds)
        return (
          n.userId === currentUser().id || n.userIds?.includes(currentUser().id)
        );
      const refs = `${n.title} ${n.body}`.match(/JOB-\d+/g) || [];
      return (
        refs.length > 0 &&
        refs.every((ref) => ownsJob(state.jobs.find((j) => j.number === ref)))
      );
    });
  }
  function jobApprovalStatus(j) {
    return (
      jobApprovals?.status(j) ||
      (j.status === "Completed" ? "Pending Approval" : "Not Ready")
    );
  }
  function jobBadges(j) {
    return (
      badge(stageLabel(j)) +
      (j.reopenedAt && j.status !== "Completed"
        ? ` ${badge("Reopened")}`
        : "") +
      (j.status === "Completed" ? ` ${badge(jobApprovalStatus(j))}` : "")
    );
  }
  function stageDestination(stage) {
    return (
      {
        Confirmed: "jobs",
        "Stock Shortage": "purchasing",
        Picking: "picking",
        "Ready for Collection": "picking",
        Collected: "calendar",
        "Installation Scheduled": "calendar",
        "Installation in Progress": "jobs",
        "Return Pending": "returns",
        Completed: "jobs",
        "On Hold": "jobs",
      }[stage] || "jobs"
    );
  }
  function taskDestination(t) {
    if (t.requestId) return "picking";
    if (t.returnId) return "returns";
    if (t.workflowAction === "collection-restock") return "purchasing";
    if (t.workflowAction === "installation-proof") return "jobs";
    if (/pick.?up|picking|collection/i.test(`${t.category} ${t.title}`))
      return "picking";
    if (t.category === "Return") return "returns";
    if (t.category === "Billing") return "billing";
    if (t.category === "Sales") return "leads";
    if (t.category === "Warehouse")
      return t.jobStage === "Stock Shortage" ||
        /purchase|shortage|supplier/i.test(t.title)
        ? "purchasing"
        : "inventory";
    if (t.category === "Installation")
      return /schedul|confirm.*date|assign.*installer/i.test(t.title)
        ? "calendar"
        : t.jobId
          ? "jobs"
          : "tasks";
    return t.jobStage ? stageDestination(t.jobStage) : "tasks";
  }
  function openRelatedWork(kind, id, stage) {
    const t = kind === "task" ? state.tasks.find((x) => x.id === id) : null,
      j = kind === "task" ? jobOf(t?.jobId) : jobOf(id);
    if (t?.requestId) {
      if (!canViewTask(t))
        return deniedWorkflow("This product request task is not available.");
      return openProductRequest(t.requestId);
    }
    if (t?.returnId) {
      if (!canViewTask(t))
        return deniedWorkflow("This return task is not assigned to you.");
      return openReturnWork(t.returnId);
    }
    if (kind === "task" ? !canViewTask(t) : !canViewJob(j))
      return deniedWorkflow("This work is not available to your account.");
    if (
      stage &&
      (!j ||
        !(j.stages?.some((s) => s.id === stage) || jobStatuses.includes(stage)))
    )
      return deniedWorkflow("Unknown job stage.");
    const target =
      kind === "task"
        ? taskDestination(t)
        : stageDestination(stageType(j, stage || j.status));
    if (!allowedPage(target)) {
      toast(
        `Your account cannot open ${PAGE_TITLES[target] || target}. Contact your administrator.`,
        "error",
      );
      return false;
    }
    ui.workContext = {
      page: target,
      jobId: j?.id || "",
      taskId: t?.id || "",
      stage: stage || t?.jobStage || j?.status || "",
    };
    if (target === "picking") {
      ui.productRequestId = "";
      ui.scanPickId =
        state.pickLists.find((p) => p.jobId === j?.id)?.id || null;
      ui.scanMessage = "";
    }
    if (target === "billing")
      ui.billingTab = /chase|overdue|remind/i.test(t?.title || "")
        ? "Client Chase"
        : "Invoices";
    if (target === "inventory") ui.inventorySearch = "";
    if (target === "purchasing") ui.purchasingTab = "Purchase Orders";
    if (target === "calendar") ui.calendarView = "Agenda";
    if (target === "leads") {
      ui.leadStatus = "All";
      ui.leadStage = "All";
      ui.leadPriority = "All";
      ui.leadSearch = "";
      ui.workLeadId = t?.leadId || j?.leadId || "";
    }
    if (target === "jobs") ui.jobFilter = "All";
    route(target, true);
    if (target === "jobs" && j) {
      ui.modal = { type: "job", id: j.id };
      ui.jobTab =
        t?.workflowAction === "installation-proof" ? "photos" : "overview";
      ui.jobUsed = {};
      render();
    }
    if (target === "leads" && ui.workLeadId && leadOf(ui.workLeadId)) {
      ui.modal = { type: "lead", id: ui.workLeadId };
      ui.quoteDraft = {
        leadId: ui.workLeadId,
        ...blankDraft(leadOf(ui.workLeadId)),
      };
      render();
    }
    requestAnimationFrame(() => {
      const c = root.querySelector(".content");
      if (c) c.scrollTop = 0;
    });
    return true;
  }

  function adminTaskControls(t) {
    return !isStatusAdmin()
      ? ""
      : `<div class="admin-status-control mt8" data-status-control><label class="small muted" for="task-status-${attr(t.id)}-${ui.modal ? "modal" : "page"}">Admin status</label><div class="row gap6"><select class="select" id="task-status-${attr(t.id)}-${ui.modal ? "modal" : "page"}" data-admin-task-status>${taskStatuses.map((x) => `<option ${x === t.status ? "selected" : ""}>${esc(x)}</option>`).join("")}</select><button class="btn secondary sm" data-action="admin-task-status" data-id="${attr(t.id)}">Apply</button></div></div>`;
  }
  function adminJobControls(j) {
    return !isStatusAdmin()
      ? ""
      : `<section class="admin-job-control" data-status-control><div class="row wrap gap10"><label class="small strong" for="admin-job-status">Admin status override</label><select class="select" id="admin-job-status" data-admin-job-status>${(j
          .stages?.length
          ? activeStages(j)
              .map((s) => s.id)
              .concat("On Hold")
          : jobStatuses
        )
          .map(
            (x) =>
              `<option value="${attr(x)}" ${x === j.status ? "selected" : ""}>${esc(stageLabel(j, x))}</option>`,
          )
          .join(
            "",
          )}</select><button class="btn secondary" data-action="admin-job-status" data-id="${attr(j.id)}">Apply status</button></div><p class="small muted">Move through applicable stages. Mandatory stock, task and evidence checks also apply to management. The change is recorded in Audit Logs.</p></section>`;
  }
  function adminSetJobStatus(id, status) {
    const j = jobOf(id);
    if (
      !isStatusAdmin() ||
      !hasCapability("job_manage") ||
      !j ||
      !(
        j?.stages?.some((s) => s.id === status && s.applicable !== false) ||
        jobStatuses.includes(status)
      )
    )
      return deniedWorkflow(
        "Only Admin and Super Admin can apply a valid job status override.",
      );
    const before = j.status;
    if (before === status) return true;
    const validation = jobTransitionError(j, status);
    if (validation) return deniedWorkflow(validation);
    if (status === "On Hold") j.resumeStage = before;
    j.status = status;
    markJobProvisional(j);
    if (status === "Completed")
      j.finalBillingStatus = "Needs reconciliation — admin status override";
    if (status !== "Completed") ensureInstallationProofTask(state, j);
    ui.scanMessage = "";
    stopCamera();
    j.timeline.unshift({
      id: uid("event"),
      title: "Admin status override",
      detail: `${userName(currentUser().id)} changed ${before} → ${status}. Linked tasks and stock were not changed.`,
      at: now(),
      userId: currentUser().id,
    });
    log(
      "Admin job status override",
      "Job",
      j.number,
      `${before} → ${status}; set by ${userName(currentUser().id)}. Linked tasks and stock unchanged.`,
    );
    return true;
  }
  function installerActionAllowed(action) {
    return [
      "open-approved-return",
      "self-collect-return",
      "request-product",
      "confirm-addition-location",
      "scan-addition",
      "close-addition",
      "cancel-return",
      "start-return",
      "scan-return",
      "submit-return",
      "collect-return",
      "deliver-return",
      "remove-return-item",
      "select-account",
      "mobile-menu",
      "open-search",
      "open-notifications",
      "close-drawer",
      "open-notification",
      "toggle-chat-dock",
      "open-chat-thread",
      "select-chat-user",
      "chat-back",
      "close-chat-dock",
      "close-page-chat",
      "chat-attach",
      "remove-chat-attachment",
      "send-chat",
      "close-modal",
      "close-child",
      "open-job",
      "open-installation-proof",
      "retry-proof-location",
      "open-job-work",
      "open-task-work",
      "open-stage-work",
      "clear-work-context",
      "job-tab",
      "job-status",
      "confirm-collection",
      "complete-installation",
      "task-start",
      "task-complete",
      "calendar-view",
      "select-pick",
      "confirm-pickup-location",
      "scan-barcode",
      "quick-scan",
      "toggle-camera",
      "return-received",
      "logout",
      "end-impersonation",
    ].includes(action);
  }

  function canViewJob(j) {
    return !!j && !!currentUser() && allowedPage("jobs") && ownsJob(j);
  }

  function canAdvanceJob(j) {
    if (!canViewJob(j) || !hasCapability("job_manage")) return false;
    if (isStatusAdmin()) return true;
    const id = currentUser().id,
      stage = j.status,
      owners = linkedJobTasks(j)
        .filter((t) => t.jobStage === stage)
        .map((t) => t.assignedTo);
    if (
      [
        "Ready for Collection",
        "Collected",
        "Installation Scheduled",
        "Installation in Progress",
        "Return Pending",
      ].includes(stage)
    )
      return j.installerId === id || owners.includes(id);
    if (owners.length) return owners.includes(id);
    return ["super_admin", "admin", "manager"].includes(state.session.role);
  }
  function nextJobStage(j) {
    if (j.workflowVersion === 1) {
      const next = nextStage(j);
      return next === "Completed" && installationHasReturns(j)
        ? "Return Pending"
        : next;
    }
    if (!stockFacts(j).requiresCompanyStock && !stockFacts(j).activity) {
      const type = workType(j),
        scheduled =
          type === "repair" ? "Repair Scheduled" : "Installation Scheduled",
        progress =
          type === "repair" ? "Repair in Progress" : "Installation in Progress";
      return (
        {
          Confirmed: type === "supply" ? "Completed" : scheduled,
          [scheduled]: progress,
          [progress]: installationHasReturns(j)
            ? "Return Pending"
            : "Completed",
          "Return Pending": "Completed",
          "On Hold": j.resumeStage || "Confirmed",
        }[j.status] || null
      );
    }
    return (
      {
        Confirmed: "Picking",
        "Stock Shortage": "Picking",
        Picking: "Ready for Collection",
        "Ready for Collection": "Collected",
        Collected:
          workType(j) === "repair"
            ? "Repair Scheduled"
            : "Installation Scheduled",
        "Repair Scheduled": "Repair in Progress",
        "Installation Scheduled": "Installation in Progress",
        "Repair in Progress": installationHasReturns(j)
          ? "Return Pending"
          : "Completed",
        "Installation in Progress": installationHasReturns(j)
          ? "Return Pending"
          : "Completed",
        "Return Pending": "Completed",
        "On Hold": j.resumeStage || "Confirmed",
      }[j.status] || null
    );
  }
  function installationHasReturns(j) {
    return (
      state.returns.some(
        (r) =>
          r.jobId === j.id && !["Processed", "Cancelled"].includes(r.status),
      ) ||
      j.items.some(
        (x) =>
          Math.max(0, Number(ui.jobUsed?.[x.id] ?? x.quantityPicked)) <
          x.quantityPicked,
      ) ||
      linkedJobTasks(j).some(
        (t) => t.jobStage === "Return Pending" && t.status !== "Completed",
      )
    );
  }
  function jobTransitionError(j, target) {
    if (!j || !canViewJob(j)) return "Job not available.";
    if (!canAdvanceJob(j))
      return "Only the assigned installer or a task owner for this stage can move this job forward.";
    if (target !== nextJobStage(j))
      return "Move through the job stages in order. Refresh the job and use its next-stage button.";
    const targetKind = stageType(j, target);
    if (j.financialHold)
      return "This job has a financial hold. Contact your administrator before proceeding.";
    if (
      targetKind === "Ready for Collection" &&
      j.items.length &&
      !jobPickList(j)?.pickupConfirmedAt
    )
      return "Confirm the warehouse location in Picking before collection.";
    if (targetKind === "Collected" && j.items.length && !matchesComplete(j))
      return "Match all required product quantities during collection.";
    if (targetKind === "Collected" && !j.collectionIssuedAt) {
      const stockError = collectionStockError(j);
      if (stockError) return stockError;
    }
    if (
      [
        "Installation Scheduled",
        "Installation in Progress",
        "Repair in Progress",
        "Return Pending",
        "Completed",
      ].includes(targetKind) &&
      stockFacts(j).outstanding > 0
    )
      return "Complete verified collection before installation. An admin stage override does not issue stock.";
    if (
      ((["Installation in Progress", "Repair in Progress"].includes(
        stageType(j),
      ) &&
        ["Return Pending", "Completed"].includes(target)) ||
        target === "Completed") &&
      workType(j) !== "supply" &&
      !hasInstallationProof(j)
    )
      return "Upload an installation photo or video with device location before completing the job. The saved media must be available in this browser.";
    if (target === "Completed") {
      const workflowError = completionError(
        j,
        linkedJobTasks(j),
        state.returns.filter((r) => r.jobId === j.id),
      );
      if (workflowError) return workflowError;
      const error = finalFinancialError(j);
      if (error) return error;
    }
    const pending = stageBlockers(j, target);
    if (isInstaller() && pending.some((t) => !canViewTask(t)))
      return "Other required work for this job is still pending. Contact your manager before advancing.";
    if (pending.length)
      return `Complete ${pending.length} required task${pending.length === 1 ? "" : "s"} before leaving ${j.status}: ${pending.map((t) => t.title).join("; ")}.`;
    if (
      target === "Completed" &&
      state.returns.some(
        (r) =>
          r.jobId === j.id && !["Processed", "Cancelled"].includes(r.status),
      )
    )
      return "Process all outstanding product returns before completing this job.";
    return "";
  }
  function deniedWorkflow(message, j) {
    if (j) log("Job transition blocked", "Job", j.number, message, "Denied");
    save();
    toast(message, "error");
    return false;
  }
  function recordJobStage(j, target) {
    const before = j.status;
    const passed = j.stages?.find((s) => s.id === before);
    if (passed && target !== "On Hold")
      Object.assign(passed, {
        status: "Completed",
        completedAt: now(),
        completedBy: currentUser()?.id,
      });
    j.status = target;
    if (target === "Completed") {
      j.completedAt = now();
      j.completionHistory ||= [];
      j.completionHistory.push({ at: j.completedAt, by: currentUser()?.id });
    }
    if (target === "Completed") finalizeJobBilling(j);
    ui.scanMessage = "";
    stopCamera();
    j.timeline.unshift({
      id: uid("event"),
      title: `Status changed to ${target}`,
      detail: `${userName(currentUser()?.id)} moved this job from ${before} after its required tasks were completed.`,
      at: now(),
      userId: currentUser()?.id,
    });
    log("Job status changed", "Job", j.number, `${before} → ${target}.`);
  }
  function taskUpdateError(t, override = false) {
    if (!t || !canViewTask(t))
      return "This task is not available to your account.";
    if (!applicableTask(t, jobOf(t.jobId)))
      return "This task is not applicable.";
    // Status overrides cannot bypass evidence, stock or required work.
    if (override && !isStatusAdmin()) return "Management permission required.";
    if (
      !hasCapability("task_manage") ||
      (!isStatusAdmin() && t.assignedTo !== currentUser()?.id)
    )
      return "Only the person assigned to this task can start or complete it.";
    if (t.status === "Completed") return "This task is already completed.";
    if (t.requestId)
      return "Complete the approval, pickup or scan through its product request.";
    if (t.returnId)
      return "Open Returns and complete the verified delivery steps for this task.";
    const j = jobOf(t.jobId);
    if (t.jobId && !j)
      return "The linked job is missing. Ask a manager to update the task link.";
    if (j && j.status === "Completed") return "This job is already completed.";
    if (j && j.status === "On Hold" && t.jobStage !== "On Hold")
      return "This job is on hold. Resume the job before updating its operational tasks.";
    if (
      j &&
      t.requiresStock &&
      stockFacts(
        t.dependsOnItemIds?.length
          ? {
              ...j,
              items: j.items.filter((x) => t.dependsOnItemIds.includes(x.id)),
            }
          : j,
      ).outstanding
    )
      return "This task depends on company stock that has not been issued.";
    if (
      j &&
      !["schedule-work"].includes(t.workflowAction) &&
      stageRank(t.jobStage, j) > stageRank(activeJobStage(j), j)
    )
      return `This task belongs to ${t.jobStage}. Complete the earlier job stages first.`;
    return "";
  }
  function updateTaskStatus(id, status, override = false) {
    if (override && !isStatusAdmin())
      return deniedWorkflow("Only administrators can override task status.");
    const t = state.tasks.find((x) => x.id === id);
    if (!taskStatuses.includes(status))
      return deniedWorkflow("Unknown task status.");
    if (!isStatusAdmin() && !["In Progress", "Completed"].includes(status))
      return deniedWorkflow(
        "Only administrators can choose an arbitrary task status.",
      );
    const error = taskUpdateError(t, override);
    if (error) return deniedWorkflow(error);
    const evidenceJob = jobOf(t.jobId);
    if (status === "Completed" && evidenceJob) {
      if (
        t.requiredEvidence &&
        t.requiredEvidence !== "none" &&
        !installationEvidence(evidenceJob, t.requiredEvidence).some(
          (p) => proofAvailability.get(p.blobId) === true,
        )
      )
        return deniedWorkflow(
          "Save the required evidence before completing this task.",
        );
      if (
        t.workflowAction === "installation-proof" &&
        !hasInstallationProof(evidenceJob)
      )
        return deniedWorkflow(
          "Upload the installation media with device location to complete this required task.",
        );
      if (locationTask(t) && !jobPickList(evidenceJob)?.pickupConfirmedAt)
        return deniedWorkflow(
          "Confirm the pickup location to complete this task.",
        );
      if (collectionTask(t) && !matchesComplete(evidenceJob))
        return deniedWorkflow(
          "Match all required collection quantities to complete this task.",
        );
    }
    const before = t.status;
    t.status = status;
    if (status === "Completed") {
      t.completedAt = now();
      t.completedBy = currentUser().id;
    } else {
      delete t.completedAt;
      delete t.completedBy;
    }
    const j = jobOf(t.jobId),
      action = override ? "Admin task status override" : "Task status changed";
    if (j)
      j.timeline.unshift({
        id: uid("event"),
        title: action,
        detail: `${t.title} · ${t.jobStage} · ${before} → ${status}`,
        at: now(),
        userId: currentUser().id,
        taskId: t.id,
      });
    log(
      action,
      "Task",
      t.id,
      `${t.title} · ${before} → ${status} · changed by ${userName(currentUser().id)}${j ? ` · ${j.number}` : ""}`,
    );
    if (j && !override && status === "Completed") tryAdvanceOperationalJob(j);
    return true;
  }

  function taskActionButtons(t) {
    if (t.requestId)
      return (
        `<button class="btn secondary sm" data-action="open-task-work" data-id="${attr(t.id)}">Open product request</button>` +
        adminTaskControls(t)
      );
    if (t.returnId)
      return (
        `<button class="btn secondary sm" data-action="open-task-work" data-id="${attr(t.id)}">Open return</button>` +
        adminTaskControls(t)
      );
    if (t.workflowAction === "installation-proof" && t.status !== "Completed")
      return (
        `<button class="btn secondary sm" data-action="open-installation-proof" data-id="${attr(t.jobId)}">Upload installation evidence</button>` +
        adminTaskControls(t)
      );
    if (t.status !== "Completed" && (locationTask(t) || collectionTask(t)))
      return (
        `<button class="btn secondary sm" data-action="open-task-work" data-id="${attr(t.id)}">${locationTask(t) ? "Confirm pickup location" : "Match collection products"}</button>` +
        adminTaskControls(t)
      );
    const error = taskUpdateError(t);
    return (
      (t.status === "Completed"
        ? badge("Completed")
        : `<div class="row wrap gap6">${t.status !== "In Progress" ? `<button class="btn secondary sm" data-action="task-start" data-id="${attr(t.id)}" ${error ? "disabled" : ""} title="${attr(error || "Start task")}">Start</button>` : ""}<button class="btn sm" data-action="task-complete" data-id="${attr(t.id)}" ${error ? "disabled" : ""} title="${attr(error || "Complete task")}">Complete</button></div>${error ? `<div class="secondary-line">${esc(error)}</div>` : ""}`) +
      adminTaskControls(t)
    );
  }
  function stageActionButton(j) {
    const next = nextJobStage(j);
    if (!next) return adminJobControls(j) || badge("Completed");
    const error = jobTransitionError(j, next),
      action =
        j.status === "Ready for Collection"
          ? "confirm-collection"
          : j.status === "Installation in Progress"
            ? "complete-installation"
            : "job-status";
    return `${adminJobControls(j)}<div class="workflow-next"><button class="btn" data-action="${action}" data-id="${attr(j.id)}" data-status="${attr(next)}" ${error ? "disabled" : ""} title="${attr(error || "All stage requirements are complete")}">${action === "confirm-collection" ? "Confirm collection" : action === "complete-installation" ? "Complete installation" : `Move to ${esc(next)}`} ${icon("arrow")}</button>${error ? `<div class="small muted mt8" role="status">${esc(error)}</div>` : ""}</div>`;
  }

  function saveTaskForm() {
    if (state.session.role === "installer" || !canRunAction("create-task"))
      return deniedWorkflow(
        "Only managers or administrators can assign tasks.",
      );
    const v = formData("#new-task-form"),
      existing = ui.modal?.taskId
        ? state.tasks.find((t) => t.id === ui.modal.taskId)
        : null,
      j = v.jobId ? jobOf(v.jobId) : null;
    if (existing?.requestId)
      return deniedWorkflow("Manage this task through its product request.");
    if (existing?.returnId)
      return deniedWorkflow(
        "Manage this task through its delivery plan in Returns.",
      );
    if (
      existing?.workflowAction === "collection-restock" &&
      (v.jobId !== existing.jobId ||
        v.jobStage !== "Ready for Collection" ||
        v.category !== "Warehouse" ||
        !["manager", "admin", "super_admin"].includes(
          state.users.find((u) => u.id === v.assignedTo)?.role,
        ))
    )
      return deniedWorkflow(
        "Restock tasks must remain linked to this job and collection stage, and assigned to management.",
      );
    if (
      existing?.workflowAction === "installation-proof" &&
      (v.jobId !== existing.jobId ||
        v.jobStage !== "Installation in Progress" ||
        v.assignedTo !== jobOf(existing.jobId)?.installerId ||
        v.category !== "Installation")
    )
      return deniedWorkflow(
        "The required installation evidence task must stay linked to this job, its installer and Installation in Progress.",
      );
    if (!v.title?.trim()) return deniedWorkflow("Task title is required.");
    if (
      !state.users.some((u) => u.id === v.assignedTo && u.status === "Active")
    )
      return deniedWorkflow("Choose an active assignee.");
    if (!v.dueAt || !Number.isFinite(new Date(v.dueAt).getTime()))
      return deniedWorkflow("Enter a valid due date and time.");
    if (v.jobId && (!j || j.status === "Completed"))
      return deniedWorkflow("Choose an active Job Order.");
    if (
      j &&
      state.users.find((u) => u.id === v.assignedTo)?.role === "installer" &&
      j.installerId !== v.assignedTo
    )
      return deniedWorkflow(
        "Choose the installer assigned to this job, or assign this task to a manager.",
      );
    if (j && !WORK_STAGES.includes(v.jobStage))
      return deniedWorkflow(
        "Choose the job stage this task must be completed in.",
      );
    if (existing?.status === "Completed")
      return deniedWorkflow(
        "Completed tasks cannot be reassigned or relinked.",
      );
    if (
      j &&
      stageRank(v.jobStage) < stageRank(activeJobStage(j)) &&
      !(existing?.jobId === j.id && existing.jobStage === v.jobStage)
    )
      return deniedWorkflow(
        "Choose the current or a future stage; earlier stages have already been passed.",
      );
    const previous = existing
        ? `${existing.title} · ${existing.jobId || "No job"} · ${existing.jobStage || "No stage"} · ${userName(existing.assignedTo)}`
        : "",
      task = existing || { id: uid("task"), status: "Pending" },
      returnJobId = ui.modal?.returnJobId;
    Object.assign(task, {
      title: v.title.trim(),
      category: v.category,
      priority: v.priority,
      assignedTo: v.assignedTo,
      jobId: j?.id || "",
      jobStage: j ? v.jobStage : "",
      dueAt: new Date(v.dueAt).toISOString(),
      notes: v.notes || "",
    });
    if (
      !j ||
      !(
        locationTask(task) ||
        collectionTask(task) ||
        ["installation-proof", "collection-restock"].includes(
          task.workflowAction,
        )
      )
    )
      task.workflowAction = "";
    if (!existing) state.tasks.unshift(task);
    log(
      existing ? "Task updated" : "Task created",
      "Task",
      task.id,
      `${previous ? `Previous: ${previous}. ` : ""}${task.title} · ${j?.number || "General task"} · ${task.jobStage || "No job stage"} · ${userName(task.assignedTo)}`,
    );
    if (j)
      j.timeline.unshift({
        id: uid("event"),
        title: existing ? "Linked task updated" : "Stage task added",
        detail: `${task.title} · ${task.jobStage} · ${userName(task.assignedTo)}`,
        at: now(),
        userId: currentUser().id,
      });
    ui.modal = returnJobId ? { type: "job", id: returnJobId } : null;
    ui.jobTab = "overview";
    commit(existing ? "Task updated." : "Task created.");
    return true;
  }

  const proofAvailability = new Map(),
    proofURLs = new Map();
  let proofUploadBusy = false;
  function ensureInstallationProofTask(data, j) {
    j.installationProof = j.installationProof || [];
    if (j.status === "Completed" || workType(j) === "supply") return;
    let t = data.tasks.find(
      (t) =>
        t.jobId === j.id &&
        t.workflowAction === "installation-proof" &&
        !(
          t.status === "Completed" &&
          j.evidenceRequiredAfter &&
          new Date(t.completedAt) < new Date(j.evidenceRequiredAfter)
        ),
    );
    if (!t) {
      t = {
        id: uid("proof-task"),
        title: `Upload ${workType(j) === "repair" ? "repair" : "installation"} photos/videos for ${j.number}`,
        workflowOrigin: "generated",
        category: "Installation",
        jobStage:
          workType(j) === "repair"
            ? "Repair in Progress"
            : "Installation in Progress",
        workflowAction: "installation-proof",
        jobId: j.id,
        leadId: j.leadId || "",
        assignedTo: j.installerId || "",
        status: "Pending",
        priority: "High",
        dueAt: j.installationDate || now(),
        notes:
          "Upload at least one photo or video of the installed products while at the client site. Your device location is required and saved with the evidence.",
      };
      data.tasks.unshift(t);
    }
    if (t.status !== "Completed" && t.assignedTo !== (j.installerId || "")) {
      t.assignedTo = j.installerId || "";
      t.dueAt = j.installationDate || t.dueAt;
      t.status = "Pending";
      delete t.completedAt;
      delete t.completedBy;
    }
    if (t.status !== "Completed") {
      t.jobStage =
        j.stages?.find(
          (s) =>
            s.type ===
              (workType(j) === "repair"
                ? "Repair in Progress"
                : "Installation in Progress") &&
            s.status !== "Completed" &&
            s.applicable !== false,
        )?.id ||
        (workType(j) === "repair"
          ? "Repair in Progress"
          : "Installation in Progress");
      t.category = workType(j) === "repair" ? "Repair" : "Installation";
    }
  }
  function validProofLocation(g) {
    return (
      !!g &&
      Number.isFinite(g.latitude) &&
      Math.abs(g.latitude) <= 90 &&
      Number.isFinite(g.longitude) &&
      Math.abs(g.longitude) <= 180 &&
      Number.isFinite(g.accuracy) &&
      g.accuracy >= 0 &&
      g.source === "Device geolocation"
    );
  }
  function installationEvidence(j, phase = "after") {
    return (j.installationProof || []).filter(
      (p) =>
        p.userId === j.installerId &&
        (!j.evidenceRequiredAfter ||
          new Date(p.createdAt) >= new Date(j.evidenceRequiredAfter)) &&
        ["photo", "video"].includes(p.kind) &&
        p.blobId &&
        (p.phase || "after") === phase &&
        (phase === "before" || validProofLocation(p.location)),
    );
  }
  function hasInstallationProof(j) {
    return installationEvidence(j).some(
      (p) => proofAvailability.get(p.blobId) === true,
    );
  }
  function proofStore(mode, operation) {
    if (cloud) {
      // Supabase Storage replaces IndexedDB; operations use the same put/get/delete shape.
      const call = {};
      const req = operation({
        put: (blob, key) => (
          (call.fn = () => cloud.store.putMedia(key, blob)),
          {}
        ),
        get: (key) => ((call.fn = () => cloud.store.getMedia(key)), {}),
        delete: (key) => ((call.fn = () => cloud.store.deleteMedia(key)), {}),
      });
      return call.fn ? call.fn() : Promise.resolve(req && undefined);
    }
    return new Promise((resolve, reject) => {
      if (!window.indexedDB)
        return reject(Error("Media storage is not available in this browser."));
      const open = indexedDB.open("ibs-installation-media", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("media");
      open.onerror = () => reject(Error("Could not open media storage."));
      open.onsuccess = () => {
        const db = open.result;
        let value;
        const tx = db.transaction("media", mode),
          req = operation(tx.objectStore("media"));
        req.onsuccess = () => (value = req.result);
        tx.oncomplete = () => {
          db.close();
          resolve(value);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(
            Error("Media could not be saved. Check available browser storage."),
          );
        };
      };
    });
  }
  function captureProofLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation)
        return reject(
          Error(
            "Device location is unavailable. Use a browser with location access.",
          ),
        );
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!Number.isFinite(pos.timestamp))
            return reject(
              Error(
                "A fresh device location could not be obtained. Please try again.",
              ),
            );
          const g = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            capturedAt: new Date(pos.timestamp).toISOString(),
            source: "Device geolocation",
          };
          if (
            !validProofLocation(g) ||
            Math.abs(Date.now() - pos.timestamp) > 120000
          )
            return reject(
              Error(
                "A fresh device location could not be obtained. Please try again.",
              ),
            );
          resolve(g);
        },
        (error) =>
          reject(
            Error(
              error.code === 1
                ? "Location permission was denied. Allow location access and upload again."
                : error.code === 3
                  ? "Location capture timed out. Check device location services and try again."
                  : "Device location could not be determined. Enable location services. If this browser blocks local files, open the CRM on HTTPS or localhost.",
            ),
          ),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    });
  }
  function canUploadInstallationProof(j, phase = "after") {
    return (
      !!j &&
      canViewJob(j) &&
      isInstaller() &&
      currentUser().id === j.installerId &&
      hasCapability("job_manage") &&
      j.status !== "Completed" &&
      (phase === "before" ||
        [
          "Installation in Progress",
          "Repair in Progress",
          "Return Pending",
        ].includes(stageType(j)) ||
        j.stages?.some(
          (s) => s.id === j.status && s.requiredEvidence === "after",
        ))
    );
  }
  async function prepareProofBlob(file) {
    if (!file.size)
      throw Error("Empty media files cannot be used as installation evidence.");
    if (
      ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
    ) {
      if (file.size > 10 * 1024 * 1024)
        throw Error("Each photo must be 10 MB or smaller.");
      const uri = await compressPhoto(file);
      return { blob: await (await fetch(uri)).blob(), kind: "photo" };
    }
    if (["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) {
      if (file.size > 25 * 1024 * 1024)
        throw Error("Each video must be 25 MB or smaller.");
      await new Promise((resolve, reject) => {
        const video = document.createElement("video"),
          url = lifecycle.createObjectURL(file),
          timer = setTimeout(() => finish(false), 10000);
        function finish(ok) {
          clearTimeout(timer);
          video.onloadedmetadata = video.onerror = null;
          video.removeAttribute("src");
          video.load();
          lifecycle.revokeObjectURL(url);
          ok
            ? resolve()
            : reject(
                Error(
                  "This video cannot be read. Try an MP4 or WebM video supported by this browser.",
                ),
              );
        }
        video.onloadedmetadata = () =>
          finish(video.videoWidth > 0 && video.videoHeight > 0);
        video.onerror = () => finish(false);
        video.preload = "metadata";
        video.src = url;
      });
      return { blob: file, kind: "video" };
    }
    throw Error(
      "Choose a JPEG, PNG, WebP or GIF photo, or an MP4 / WebM video.",
    );
  }
  async function uploadInstallationProof(id, files, phase = "after") {
    const j = jobOf(id),
      actor = currentUser()?.id;
    if (proofUploadBusy)
      return deniedWorkflow("An evidence upload is already in progress.");
    if (!canUploadInstallationProof(j, phase))
      return deniedWorkflow(
        "Only the assigned installer may upload evidence for this outstanding work.",
      );
    files = Array.from(files || []);
    const pending = () =>
      (j.installationProof || []).filter(
        (p) =>
          p.userId === actor &&
          (p.phase || "after") === phase &&
          p.pendingLocation,
      );
    if (!files.length && !pending().length) return false;
    if (
      files.length > 5 ||
      files.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024
    )
      return deniedWorkflow("Upload up to 5 files and 50 MB per batch.");
    proofUploadBusy = true;
    ui.proofUploadJob = id;
    ui.proofMessageJob = id;
    ui.proofMessage = "Saving evidence…";
    render();
    try {
      for (const file of files) {
        const prepared = await prepareProofBlob(file),
          blobId = uid("installation-media");
        await proofStore("readwrite", (store) =>
          store.put(prepared.blob, blobId),
        );
        if (
          currentUser()?.id !== actor ||
          !canUploadInstallationProof(j, phase)
        )
          throw Error(
            "Assignment or access changed. Evidence has not been marked complete.",
          );
        j.installationProof ||= [];
        j.installationProof.push({
          id: uid("proof"),
          blobId,
          kind: prepared.kind,
          name: file.name,
          mimeType: prepared.blob.type,
          size: prepared.blob.size,
          userId: actor,
          createdAt: now(),
          phase,
          pendingLocation: phase === "after",
          location: null,
        });
        proofAvailability.set(blobId, true);
        proofURLs.set(blobId, lifecycle.createObjectURL(prepared.blob));
      }
      // Persist uploaded references before asking for GPS. A denied/failed GPS
      // request never deletes a successful upload; retry uses these same objects.
      save();
      if (cloud && !(await flushCloud()))
        throw Error(
          cloudError ||
            "Evidence metadata could not be saved. Retry after restoring access.",
        );
      if (phase === "after") {
        const location = await captureProofLocation();
        if (
          currentUser()?.id !== actor ||
          !canUploadInstallationProof(j, phase)
        )
          throw Error(
            "Assignment or access changed. Location was not applied.",
          );
        pending().forEach((p) => {
          p.location = { ...location };
          p.pendingLocation = false;
        });
        save();
        if (cloud && !(await flushCloud()))
          throw Error(cloudError || "Location could not be saved.");
      }
      ensureInstallationProofTask(state, j);
      const task = state.tasks.find(
        (t) =>
          t.jobId === id &&
          t.status !== "Completed" &&
          (phase === "after"
            ? t.workflowAction === "installation-proof"
            : t.requiredEvidence === "before"),
      );
      if (task) {
        const before = { ...task };
        Object.assign(task, {
          status: "Completed",
          completedAt: now(),
          completedBy: actor,
          completionSource:
            phase === "after" ? "Media with device location" : "Before media",
        });
        save();
        if (cloud && !(await flushCloud())) {
          Object.assign(task, before);
          throw Error(
            cloudError ||
              "Evidence saved, but task completion was not confirmed. Retry task completion.",
          );
        }
      }
      j.timeline.unshift({
        id: uid("event"),
        title: `${phase === "before" ? "Before" : "After"} work evidence saved`,
        detail:
          phase === "before"
            ? "Photo/video saved; location not required."
            : "Photo/video and uploading installer device location saved.",
        at: now(),
        userId: actor,
      });
      save();
      if (cloud && !(await flushCloud()))
        throw Error(
          cloudError || "Evidence was saved; history update needs retry.",
        );
      ui.proofMessage = "Evidence saved successfully.";
      return true;
    } catch (error) {
      ui.proofMessage =
        error.message +
        " Uploaded media is retained; retry device location if needed.";
      toast(ui.proofMessage, "error");
      return false;
    } finally {
      proofUploadBusy = false;
      ui.proofUploadJob = null;
      render();
    }
  }
  function hydrateProofMedia() {
    const j = ui.modal?.type === "job" ? jobOf(ui.modal.id) : null;
    if (!j || !canViewJob(j)) return;
    for (const p of (j.installationProof || []).filter(
      (p) => !isInstaller() || p.userId === currentUser().id,
    )) {
      if (!proofAvailability.has(p.blobId)) {
        proofAvailability.set(p.blobId, "checking");
        proofStore("readonly", (s) => s.get(p.blobId))
          .then((blob) => {
            proofAvailability.set(
              p.blobId,
              blob instanceof Blob && blob.size > 0,
            );
            if (blob instanceof Blob && blob.size > 0)
              proofURLs.set(p.blobId, lifecycle.createObjectURL(blob));
            if (ui.modal?.id === j.id && canViewJob(j)) render();
          })
          .catch(() => {
            proofAvailability.set(p.blobId, false);
            if (ui.modal?.id === j.id && canViewJob(j)) render();
          });
      }
    }
    root.querySelectorAll("[data-proof-media]").forEach((el) => {
      const p = (j.installationProof || []).find(
        (p) => p.blobId === el.dataset.proofMedia,
      );
      if (!p || (isInstaller() && p.userId !== currentUser().id)) return;
      const url = proofURLs.get(p.blobId);
      if (url && el.src !== url) el.src = url;
    });
  }

  function migrateCollectionFlow(data) {
    data.tasks.forEach((t) => {
      if (!t.workflowAction && t.jobId) {
        if (
          t.category === "Picking" &&
          t.jobStage === "Picking" &&
          /^(Complete picking|Pick reserved products|Confirm pickup warehouse location) for /i.test(
            t.title,
          )
        )
          t.workflowAction = "confirm-location";
        if (
          t.category === "Collection" &&
          t.jobStage === "Ready for Collection" &&
          /^(Collect products|Scan and match collection products) for /i.test(
            t.title,
          )
        )
          t.workflowAction = "scan-collection";
      }
    });
    data.jobs.forEach((j) => {
      if (j.collectionFlowVersion === 2) return;
      const movements = data.stockMovements.filter(
        (m) =>
          m.type === "Issue to installer" &&
          (m.jobId === j.id || String(m.reason || "").includes(j.number)),
      );
      const recorded =
        !!j.collectionIssuedAt ||
        movements.length > 0 ||
        j.timeline.some(
          (e) =>
            /Products collected after|required task completion.*collected/i.test(
              e.detail || "",
            ) || e.title === "Installer collection confirmed",
        );
      if (recorded)
        j.collectionIssuedAt =
          j.collectionIssuedAt || movements[0]?.createdAt || now();
      j.items.forEach((x) => {
        x.quantityMatched = recorded ? Number(x.quantityPicked) || 0 : 0;
      });
      const p = data.pickLists.find((p) => p.jobId === j.id);
      if (p) {
        p.legacyStatus = p.status;
        p.legacyLocation = p.scannedLocation || "";
        if (p.locationScanned) {
          p.pickupLocation = p.scannedLocation || j.warehouse;
          p.pickupConfirmedAt = now();
          p.pickupConfirmedBy = "legacy";
        }
        p.status = recorded
          ? "Completed"
          : p.pickupConfirmedAt
            ? "Awaiting collection"
            : "Pending";
      }
      j.collectionFlowVersion = 2;
    });
    return data;
  }
  function jobPickList(j) {
    return state.pickLists.find((p) => p.jobId === j.id);
  }
  function matchesComplete(j) {
    return j.items.every(
      (x) => Number(x.quantityMatched || 0) >= Number(x.quantityRequired),
    );
  }
  function collectionTask(t) {
    return (
      t.workflowAction === "scan-collection" &&
      t.category === "Collection" &&
      t.jobStage === "Ready for Collection"
    );
  }
  function locationTask(t) {
    return (
      t.workflowAction === "confirm-location" &&
      t.category === "Picking" &&
      t.jobStage === "Picking"
    );
  }
  function pickupLocations(j) {
    return [
      ...new Set(
        j.items
          .map((x) => {
            const p = state.products.find((p) => p.id === x.productId);
            return p ? `${p.warehouse} · ${p.location}` : "";
          })
          .filter(Boolean)
          .concat(j.warehouse ? [j.warehouse] : []),
      ),
    ];
  }
  function canConfirmPickup(p) {
    const j = p && jobOf(p.jobId);
    return (
      !!j &&
      canViewJob(j) &&
      hasCapability("picking_scan") &&
      (isStatusAdmin() ||
        p.assignedTo === currentUser()?.id ||
        linkedJobTasks(j).some(
          (t) => locationTask(t) && t.assignedTo === currentUser()?.id,
        ))
    );
  }
  function canCollectJob(j) {
    return (
      !!j &&
      canViewJob(j) &&
      hasCapability("picking_scan") &&
      (isStatusAdmin() ||
        j.installerId === currentUser()?.id ||
        linkedJobTasks(j).some(
          (t) => collectionTask(t) && t.assignedTo === currentUser()?.id,
        ))
    );
  }
  function autoCompleteEvidenceTasks(j, predicate) {
    linkedJobTasks(j)
      .filter(
        (t) =>
          predicate(t) &&
          t.status !== "Completed" &&
          (isStatusAdmin() || t.assignedTo === currentUser()?.id),
      )
      .forEach((t) => {
        t.status = "Completed";
        t.completedAt = now();
        t.completedBy = currentUser().id;
        t.completionSource = "Verified workflow";
        log(
          "Task completed from verification",
          "Task",
          t.id,
          `${t.title} · ${j.number}`,
        );
        j.timeline.unshift({
          id: uid("event"),
          title: "Task verified and completed",
          detail: t.title,
          at: now(),
          userId: currentUser().id,
          taskId: t.id,
        });
      });
  }
  function tryAdvanceOperationalJob(j) {
    if (j.status === "Picking" && jobPickList(j)?.pickupConfirmedAt) {
      autoCompleteEvidenceTasks(j, locationTask);
      if (!jobTransitionError(j, "Ready for Collection"))
        return setJobStatus(j.id, "Ready for Collection");
    }
    if (j.status === "Ready for Collection" && matchesComplete(j)) {
      autoCompleteEvidenceTasks(j, collectionTask);
      if (!jobTransitionError(j, "Collected") && canCollectJob(j))
        return confirmCollection(j.id);
    }
    return false;
  }
  function confirmPickupLocation(id, value) {
    const p = state.pickLists.find((p) => p.id === id),
      j = p && jobOf(p.jobId);
    if (!canConfirmPickup(p))
      return deniedWorkflow(
        "Only the assigned pickup person or an administrator can confirm the location.",
      );
    if (j.status !== "Picking" || j.collectionIssuedAt)
      return deniedWorkflow(
        "Confirm the pickup location during Picking, before collection.",
      );
    if (j.financialHold)
      return deniedWorkflow(
        "Resolve the financial hold before confirming pickup.",
      );
    const location = String(value || "").trim();
    if (!pickupLocations(j).includes(location))
      return deniedWorkflow("Select a valid warehouse location for this job.");
    if (
      p.pickupConfirmedAt &&
      p.pickupLocation !== location &&
      j.items.some((x) => Number(x.quantityMatched) > 0)
    )
      return deniedWorkflow(
        "The pickup location cannot change after collection matching starts.",
      );
    if (!p.pickupConfirmedAt || p.pickupLocation !== location) {
      p.pickupLocation = location;
      p.pickupConfirmedAt = now();
      p.pickupConfirmedBy = currentUser().id;
      p.locationScanned = true;
      p.scannedLocation = location;
      p.status = "Awaiting collection";
      log("Pickup location confirmed", "Job", j.number, location);
      j.timeline.unshift({
        id: uid("event"),
        title: "Pickup location confirmed",
        detail: location,
        at: now(),
        userId: currentUser().id,
      });
    }
    tryAdvanceOperationalJob(j);
    return true;
  }
  function pickScanError(p) {
    const j = p && jobOf(p.jobId);
    if (!j || !canViewJob(j))
      return "This collection is not available to your account.";
    if (!canCollectJob(j))
      return "Only the assigned collector or an administrator can match collection products.";
    if (j.collectionIssuedAt)
      return "Collection has already been recorded. Products cannot be issued twice.";
    if (j.status !== "Ready for Collection")
      return `Product matching is available in Ready for Collection. Current stage: ${j.status}.`;
    if (j.financialHold)
      return "Resolve the financial hold before collecting products.";
    if (!p.pickupConfirmedAt)
      return "Confirm the warehouse location in Picking before scanning collection products.";
    if (matchesComplete(j))
      return "All required quantities are scan matched. Finish any remaining stage tasks to complete collection.";
    return "";
  }

  function availableStock(p) {
    return Number(p.onHand) - Number(p.reserved);
  }
  function lowStockProduct(p) {
    return availableStock(p) < 3 || availableStock(p) <= Number(p.minimum || 0);
  }
  function stockAlertRead(n) {
    return n.audienceRoles
      ? (n.readBy || []).includes(currentUser()?.id)
      : n.read;
  }
  function managementStockNote(fields) {
    const n = {
      id: uid("note"),
      read: false,
      readBy: [],
      audienceRoles: ["manager", "admin", "super_admin"],
      createdAt: now(),
      ...fields,
    };
    state.notifications.unshift(n);
    return n;
  }
  function jobProductStock(j, id) {
    const p = state.products.find((x) => x.id === id),
      items = j.items.filter((x) => x.productId === id),
      required = items.reduce((n, x) => n + Number(x.quantityRequired), 0),
      own = items.reduce(
        (n, x) => n + Number(x.quantityReserved ?? x.quantityRequired),
        0,
      );
    const available = p
      ? Math.max(0, Number(p.onHand) - Math.max(0, Number(p.reserved) - own))
      : 0;
    return {
      product: p,
      required,
      available,
      shortfall: Math.max(0, required - available),
    };
  }
  function ensureCollectionRestock(j, id) {
    const stock = jobProductStock(j, id),
      product = stock.product;
    if (!product || !stock.shortfall) return null;
    let task = state.tasks.find(
      (t) =>
        t.workflowAction === "collection-restock" &&
        t.jobId === j.id &&
        t.productId === id &&
        (t.status !== "Completed" || !t.shortageResolvedAt),
    );
    if (!task) {
      const assignee = ["manager", "admin", "super_admin"]
        .map((role) =>
          state.users.find((u) => u.role === role && u.status === "Active"),
        )
        .find(Boolean);
      task = {
        id: uid("task"),
        title: `Order / restock ${product.name} for ${j.number}`,
        category: "Warehouse",
        status: "Pending",
        priority: "Urgent",
        assignedTo: assignee?.id || "",
        jobId: j.id,
        jobStage: "Ready for Collection",
        workflowAction: "collection-restock",
        productId: id,
        dueAt: now(),
        createdAt: now(),
        notes: `Collection blocked. Order the missing ${product.sku} units, then receive the delivery into inventory. Completing this ordering task does not add stock or match products.`,
      };
      state.tasks.unshift(task);
      managementStockNote({
        kind: "collection-restock",
        title: "Urgent: collection needs restock",
        body: `${j.number} · ${product.name}: ${stock.shortfall} additional unit(s) required. ${assignee ? "Assigned to " + assignee.name : "No active manager or administrator; assign this task."}`,
        page: "purchasing",
        jobId: j.id,
        taskId: task.id,
        productId: id,
      });
      log(
        "Urgent restock task created",
        "Task",
        task.id,
        `${j.number} · ${product.sku} · ${stock.shortfall} additional units required.`,
      );
      j.timeline.unshift({
        id: uid("event"),
        title: "Collection blocked: restock required",
        detail: `${product.name} · ${stock.shortfall} additional unit(s). Urgent management task created.`,
        at: now(),
        userId: currentUser()?.id,
        taskId: task.id,
      });
    }
    Object.assign(task, {
      requiredQuantity: stock.required,
      availableQuantity: stock.available,
      shortfall: stock.shortfall,
    });
    delete task.shortageResolvedAt;
    return task;
  }
  function syncInventoryAlerts() {
    let changed = false;
    for (const p of state.products) {
      const active = state.notifications.find(
        (n) => n.kind === "low-stock" && n.productId === p.id && !n.resolvedAt,
      );
      if (lowStockProduct(p)) {
        const title =
            availableStock(p) <= 0 ? "Out of stock" : "Low stock alert",
          body = `${p.name} (${p.sku}) · ${availableStock(p)} available, ${p.onHand} on hand, ${p.reserved} reserved · ${p.warehouse} / ${p.location}. Alert below 3 available units or at/below the product minimum (${p.minimum || 0}).`;
        if (!active) {
          managementStockNote({
            kind: "low-stock",
            title,
            body,
            page: "inventory",
            productId: p.id,
          });
          changed = true;
        } else if (active.body !== body || active.title !== title) {
          if (active.title !== title) active.readBy = [];
          Object.assign(active, { title, body });
          changed = true;
        }
      } else if (active) {
        active.resolvedAt = now();
        changed = true;
      }
    }
    for (const t of state.tasks.filter(
      (t) => t.workflowAction === "collection-restock",
    )) {
      const j = jobOf(t.jobId);
      if (!j) continue;
      const st = jobProductStock(j, t.productId),
        resolved = !!j.collectionIssuedAt || st.shortfall === 0;
      if (resolved && !t.shortageResolvedAt) {
        t.shortageResolvedAt = now();
        changed = true;
      }
      const shortage = resolved ? 0 : st.shortfall;
      if (t.shortfall !== shortage || t.availableQuantity !== st.available) {
        t.shortfall = shortage;
        t.availableQuantity = st.available;
        changed = true;
      }
      for (const n of state.notifications.filter(
        (n) => n.kind === "collection-restock" && n.taskId === t.id,
      )) {
        if (resolved && !n.resolvedAt) {
          n.resolvedAt = now();
          changed = true;
        }
        if (!resolved && t.status !== "Completed" && n.resolvedAt) {
          delete n.resolvedAt;
          n.readBy = [];
          delete t.shortageResolvedAt;
          changed = true;
        }
        if (!resolved && !n.resolvedAt) {
          const body = `${j.number} · ${st.product?.name || "Product"}: ${shortage} additional unit(s) required. Assigned to ${userName(t.assignedTo)}.`;
          if (n.body !== body) {
            n.body = body;
            changed = true;
          }
        }
      }
    }
    return changed;
  }

  function collectionStockError(j) {
    const totals = new Map(),
      ownReservations = new Map();
    for (const x of j.items) {
      if (
        !Number.isFinite(Number(x.quantityRequired)) ||
        Number(x.quantityRequired) <= 0
      )
        return "A product has an invalid required quantity.";
      totals.set(
        x.productId,
        (totals.get(x.productId) || 0) + Number(x.quantityRequired),
      );
      ownReservations.set(
        x.productId,
        (ownReservations.get(x.productId) || 0) +
          Number(x.quantityReserved ?? x.quantityRequired),
      );
    }
    for (const [id, qty] of totals) {
      const p = state.products.find((p) => p.id === id);
      if (!p)
        return "A required inventory product is missing. Ask management to correct the job.";
      if (Number(p.onHand) < qty)
        return `Insufficient stock for ${p.name}: ${p.onHand} on hand, ${qty} required. Receive or correct stock before collection.`;
      const available =
        Number(p.onHand) -
        Math.max(0, Number(p.reserved) - ownReservations.get(id));
      if (available < qty)
        return `Some ${p.name} stock is reserved for other jobs. Receive additional stock before collection.`;
    }
    return "";
  }
  function scanPickList(id, barcode, quantity = 1) {
    const p = state.pickLists.find((p) => p.id === id),
      j = p && jobOf(p.jobId),
      error = pickScanError(p);
    if (error) return { ok: false, text: error };
    const code = String(barcode || "")
        .trim()
        .toLowerCase(),
      qty = Number(quantity);
    if (!code || !Number.isFinite(qty) || qty <= 0)
      return {
        ok: false,
        text: "Enter a barcode or SKU and a positive quantity.",
      };
    const candidates = j.items.filter((x) =>
      [x.barcode, x.sku].some(
        (v) => v && String(v).trim().toLowerCase() === code,
      ),
    );
    if (!candidates.length) {
      log(
        "Collection scan rejected",
        "Job",
        j.number,
        `Code ${barcode} does not match a required product.`,
        "Denied",
      );
      return {
        ok: false,
        text: "Not matched: this product is not required for this job.",
      };
    }
    const remaining = candidates.reduce(
      (n, x) =>
        n +
        Math.max(
          0,
          Number(x.quantityRequired) - Number(x.quantityMatched || 0),
        ),
      0,
    );
    if (qty > remaining)
      return {
        ok: false,
        text:
          remaining === 0
            ? "This product is already fully scan matched."
            : `Only ${remaining} units remain. Enter that quantity or less.`,
      };
    const shortages = [...new Set(candidates.map((x) => x.productId))]
      .map((pid) => ensureCollectionRestock(j, pid))
      .filter(Boolean);
    if (shortages.length) {
      save();
      return {
        ok: false,
        text: `Insufficient stock for collection. An urgent restock task is with management (${shortages.reduce((n, t) => n + t.shortfall, 0)} additional unit(s) needed). This scan was not matched. Retry after inventory is replenished.`,
      };
    }
    let left = qty;
    for (const x of candidates) {
      const match = Math.min(
        left,
        Math.max(
          0,
          Number(x.quantityRequired) - Number(x.quantityMatched || 0),
        ),
      );
      x.quantityMatched = Number(x.quantityMatched || 0) + match;
      left -= match;
      if (!left) break;
    }
    p.status = matchesComplete(j) ? "Matched" : "In Progress";
    p.matchEvents = p.matchEvents || [];
    p.matchEvents.push({
      id: uid("match"),
      code,
      quantity: qty,
      at: now(),
      userId: currentUser().id,
    });
    log(
      "Collection product matched",
      "Job",
      j.number,
      `${barcode} · ${qty} unit(s) matched.`,
    );
    if (matchesComplete(j)) {
      autoCompleteEvidenceTasks(j, collectionTask);
      tryAdvanceOperationalJob(j);
      const issue =
        j.status === "Collected"
          ? ""
          : jobTransitionError(j, "Collected") || collectionStockError(j);
      return {
        ok: true,
        text:
          j.status === "Collected"
            ? "All required products scan matched. Collection completed; job moved to Collected."
            : `All required products scan matched. ${issue || "Complete the remaining collection requirements."}`,
      };
    }
    return {
      ok: true,
      text: `Scan matched: ${qty} unit(s). ${j.items.reduce((n, x) => n + Number(x.quantityMatched || 0), 0)}/${j.items.reduce((n, x) => n + Number(x.quantityRequired), 0)} matched.`,
    };
  }
  function confirmCollection(id) {
    if (inventoryControls)
      return deniedWorkflow(
        "Use normalized inventory commands. This legacy job/receipt needs explicit mapping before stock can change.",
      );
    const j = jobOf(id);
    if (!(canCollectJob(j) || (!j?.items.length && canAdvanceJob(j))))
      return deniedWorkflow(
        "Only the assigned collector or an administrator can complete collection.",
      );
    if (j.collectionIssuedAt) {
      if (j.status === "Collected") return true;
      return deniedWorkflow(
        "This job already has a recorded collection. Use its existing stock record; it cannot be issued again.",
      );
    }
    if (j.status !== "Ready for Collection")
      return deniedWorkflow(
        "Complete pickup first. Collection takes place in Ready for Collection.",
      );
    if (j.items.length && !jobPickList(j)?.pickupConfirmedAt)
      return deniedWorkflow("Confirm the pickup location before collection.");
    if (!matchesComplete(j))
      return deniedWorkflow(
        "Match every required product quantity before collection.",
      );
    [...new Set(j.items.map((x) => x.productId))].forEach((pid) =>
      ensureCollectionRestock(j, pid),
    );
    autoCompleteEvidenceTasks(j, collectionTask);
    const error = jobTransitionError(j, "Collected") || collectionStockError(j);
    if (error) return deniedWorkflow(error, j);
    const at = now();
    for (const x of j.items) {
      const product = state.products.find((p) => p.id === x.productId),
        qty = Number(x.quantityRequired);
      product.onHand -= qty;
      product.reserved = Math.max(
        0,
        product.reserved - (x.quantityReserved ?? qty),
      );
      x.quantityPicked = qty;
      x.quantityIssued = qty;
      state.stockMovements.unshift({
        id: uid("movement"),
        productId: product.id,
        productName: product.name,
        type: "Issue to installer",
        quantity: -qty,
        reason: `Collected for ${j.number}`,
        userId: currentUser().id,
        jobId: id,
        jobItemId: x.id,
        createdAt: at,
      });
    }
    j.collectionIssuedAt = at;
    j.collectedBy = currentUser().id;
    const p = jobPickList(j);
    if (p) {
      p.status = "Completed";
      p.completedAt = at;
    }
    recordJobStage(j, "Collected");
    log(
      "Collection completed",
      "Job",
      j.number,
      "Every required product matched; warehouse stock issued once.",
    );
    return true;
  }

  function visiblePickLists() {
    return state.pickLists.filter(
      (p) => canViewJob(jobOf(p.jobId)) && inWorkJob(p.jobId),
    );
  }

  function allJobItems(j) {
    return [...j.items, ...(j.extraItems || [])];
  }
  function returnReason(value, note = "") {
    const map = {
      Unused: "No need for this product",
      Damaged: "Defective piece",
      "Incorrect product": "Need other product",
    };
    const reason = map[value] || value;
    return [
      "Defective piece",
      "Need other product",
      "No need for this product",
    ].includes(reason)
      ? reason
      : reason === "Other" && String(note).trim()
        ? `Other: ${String(note).trim()}`
        : "";
  }
  async function selfCollectReturn(id, reason, note, onsite) {
    const r = returnOf(id),
      actor = currentUser()?.id;
    if (!canEditReturn(r) || !isInstaller() || !onsite || !r.items.length)
      return deniedWorkflow(
        "Select your job, scan the returned products and confirm you are at the client location.",
      );
    const why = returnReason(reason, note);
    if (!why) return deniedWorkflow("Select a return reason; explain Other.");
    try {
      const location = await captureProofLocation();
      if (
        currentUser()?.id !== actor ||
        returnOf(id) !== r ||
        !canEditReturn(r)
      )
        throw Error("The return or account changed. Start again.");
      const j = jobOf(r.jobId);
      if (
        r.items.some(
          (x) =>
            x.quantity >
            returnAllowance(
              j,
              allJobItems(j).find((i) => i.id === x.jobItemId),
              r.id,
            ),
        )
      )
        throw Error("Return quantities changed. Review the request.");
      Object.assign(r, {
        reason: why,
        condition: why === "Defective piece" ? "Damaged" : "Unused",
        method: "Installer pickup",
        pickupInstallerId: actor,
        managerId: returnManager(),
        warehouse: returnWarehouses()[0],
        status: "Collected for return",
        collectedAt: now(),
        submittedAt: now(),
        siteCollection: {
          location,
          confirmedAt: now(),
          userId: actor,
          confirmation:
            "Installer confirmed they are at the client location; device position recorded.",
        },
      });
      r.items.forEach((x) => (x.pickupMatched = x.quantity));
      const t = returnTask(
        r,
        "return-pickup",
        actor,
        `Deliver onsite return ${r.number} to warehouse`,
      );
      t.status = "In Progress";
      const receive = returnTask(
        r,
        "return-receive",
        r.managerId,
        `Receive and inspect ${r.number}`,
      );
      managementStockNote({
        kind: "onsite-return",
        title: "Installer collected return onsite",
        body: `${r.number} · ${j.number} · ${why}. Awaiting warehouse delivery and form.`,
        page: "returns",
        taskId: receive.id,
        returnId: r.id,
      });
      markJobProvisional(j);
      returnEvent(
        r,
        "Return collected at client site",
        why + " · Device location recorded; management approval not required.",
      );
      commit(
        "Onsite collection recorded. Upload the return form and deliver to the warehouse.",
      );
      return true;
    } catch (e) {
      return deniedWorkflow(e.message || "Location could not be captured.");
    }
  }
  function markJobProvisional(j) {
    if (j.finalSettlements?.length)
      j.finalBillingStatus = "Provisional — return / replacement in progress";
  }
  function reopenJob(id, target, reason) {
    const j = jobOf(id);
    if (
      !canManageJobDetails() ||
      !j ||
      !["Completed", "On Hold"].includes(j.status) ||
      !["Installation in Progress", "Repair in Progress", "On Hold"].includes(
        target,
      ) ||
      !String(reason || "").trim()
    )
      return deniedWorkflow(
        "Management must select Pending or In progress and enter a reopening reason.",
      );
    const before = j.status;
    j.reopenHistory ||= [];
    j.reopenHistory.push({
      at: now(),
      by: currentUser().id,
      reason,
      previousCompletion: j.completedAt,
      previousApproval: j.approvalStatus,
    });
    j.reopenedAt = now();
    j.reopenReason = reason;
    j.status =
      target === "Installation in Progress" && workType(j) === "repair"
        ? "Repair in Progress"
        : target;
    const reopened = j.stages?.find((s) => s.id === j.status);
    if (reopened?.status === "Completed") {
      const fresh = {
        id: `${reopened.type}:reopen:${uid("stage")}`,
        type: reopened.type,
        name: reopened.name,
        description: reopened.description || "",
        origin: "generated",
        status: "Pending",
        applicable: true,
        previousStageId: reopened.id,
      };
      j.stages.push(fresh);
      j.status = fresh.id;
    }
    j.evidenceRequiredAfter = now();
    if (target === "On Hold")
      j.resumeStage =
        workType(j) === "repair"
          ? "Repair in Progress"
          : "Installation in Progress";
    markJobProvisional(j);
    ensureInstallationProofTask(state, j);
    j.timeline.unshift({
      id: uid("event"),
      title: "Job reopened for return / replacement",
      detail: `${before} → ${target}. ${reason}`,
      at: now(),
      userId: currentUser().id,
    });
    log("Job reopened", "Job", j.number, reason);
    save();
    return true;
  }
  function requestOf(id) {
    return (state.productRequests || []).find((r) => r.id === id);
  }
  function canViewProductRequest(r) {
    return (
      !!r &&
      !!currentUser() &&
      (!isInstaller() ||
        r.requestedBy === currentUser().id ||
        r.installerId === currentUser().id ||
        jobOf(r.jobId)?.installerId === currentUser().id)
    );
  }
  function requestProduct(
    jobId,
    productId,
    quantity,
    reason,
    returnId = "",
    direction = "outbound",
  ) {
    const j = jobOf(jobId),
      r = returnOf(returnId),
      p = state.products.find((p) => p.id === productId),
      qty = Number(quantity);
    if (
      !j ||
      !hasCapability("job_manage") ||
      !(canViewJob(j) || (r?.jobId === j.id && canViewReturn(r))) ||
      !p ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      !String(reason || "").trim()
    )
      return deniedWorkflow(
        "Select an inventory product, positive whole quantity and reason for this job.",
      );
    if (
      (state.productRequests || []).some(
        (x) =>
          x.jobId === jobId &&
          x.productId === productId &&
          (x.direction || "outbound") ===
            (direction === "return" ? "return" : "outbound") &&
          x.requestedBy === currentUser().id &&
          !["Rejected", "Collected", "Returned", "Cancelled"].includes(
            x.status,
          ),
      )
    )
      return deniedWorkflow(
        "An open request already exists for this product on this job.",
      );
    const req = {
      id: uid("product-request"),
      jobId,
      returnId: r?.jobId === j.id ? r.id : "",
      productId,
      direction: direction === "return" ? "return" : "outbound",
      quantity: qty,
      reason: String(reason).trim(),
      requestedBy: currentUser().id,
      installerId: isInstaller() ? currentUser().id : j.installerId,
      status: "Awaiting approval",
      createdAt: now(),
      matched: 0,
    };
    state.productRequests = state.productRequests || [];
    state.productRequests.unshift(req);
    const t = {
      id: uid("task"),
      requestId: req.id,
      jobId,
      jobStage: j.status === "Completed" ? "Return Pending" : j.status,
      category: "Warehouse",
      workflowAction: "replacement-approval",
      title: `Approve ${p.sku} addition for ${j.number}`,
      assignedTo: returnManager(),
      status: "Pending",
      priority: "High",
      dueAt: now(),
      notes: req.reason,
    };
    state.tasks.unshift(t);
    managementStockNote({
      kind: "product-request",
      title: "Different SKU needs approval",
      body: `${j.number} · ${p.name} · ${qty} unit(s). ${req.reason}`,
      page: "picking",
      taskId: t.id,
    });
    markJobProvisional(j);
    log(
      "Product addition requested",
      "Job",
      j.number,
      `${p.sku} · ${qty} · ${req.reason}`,
    );
    save();
    return req;
  }
  function completeRequestTasks(r, actions) {
    state.tasks
      .filter((t) => t.requestId === r.id && actions.includes(t.workflowAction))
      .forEach((t) => {
        t.status = "Completed";
        t.completedAt = now();
        t.completedBy = currentUser()?.id;
        t.completionSource = "Verified product request workflow";
      });
  }
  function decideProductRequest(id, approve, installerId, unitGross, note) {
    if (inventoryControls)
      return deniedWorkflow(
        "Use normalized inventory commands. This legacy job/receipt needs explicit mapping before stock can change.",
      );
    const r = requestOf(id),
      j = r && jobOf(r.jobId),
      p = r && state.products.find((p) => p.id === r.productId),
      price = Number(unitGross);
    if (!canManageJobDetails() || !r || r.status !== "Awaiting approval" || !p)
      return deniedWorkflow(
        "Only management can decide an awaiting product request.",
      );
    if (!String(note || "").trim())
      return deniedWorkflow("Record the approval or rejection reason.");
    if (approve && r.direction !== "return" && !hasCapability("billing_manage"))
      return deniedWorkflow(
        "Billing permission is required to approve a client charge.",
      );
    if (
      approve &&
      (String(unitGross ?? "").trim() === "" ||
        !state.users.some(
          (u) =>
            u.id === installerId &&
            u.role === "installer" &&
            u.status === "Active",
        ) ||
        !Number.isFinite(price) ||
        price < 0)
    )
      return deniedWorkflow(
        "Choose an active collector and confirm a non-negative unit price including tax.",
      );
    if (approve && j.status === "Completed")
      return deniedWorkflow(
        "Reopen this completed job before approving new pickup work.",
      );
    r.decisionNote = note;
    r.decidedAt = now();
    r.decidedBy = currentUser().id;
    if (!approve) {
      r.status = "Rejected";
      completeRequestTasks(r, ["replacement-approval"]);
      log("Product request rejected", "Job", j.number, note);
      save();
      return true;
    }
    if (j.status === "Completed")
      return deniedWorkflow(
        "Reopen this completed job before approving new pickup work.",
      );
    if (r.direction === "return") return approveReturnSKU(r, installerId, note);
    r.status = "Approved";
    r.installerId = installerId;
    r.unitGross = Math.round(price * 100) / 100;
    r.productSnapshot = {
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      warehouse: p.warehouse,
      location: p.location,
    };
    r.reservedQuantity = Math.min(
      r.quantity,
      Math.max(0, p.onHand - p.reserved),
    );
    p.reserved += r.reservedQuantity;
    completeRequestTasks(r, ["replacement-approval"]);
    for (const [action, title] of [
      ["replacement-location", "Confirm additional product pickup location"],
      ["replacement-scan", "Scan and collect approved additional product"],
    ])
      state.tasks.unshift({
        id: uid("task"),
        requestId: r.id,
        jobId: j.id,
        jobStage: "Installation in Progress",
        category: action === "replacement-location" ? "Picking" : "Collection",
        workflowAction: action,
        title: `${title} · ${j.number} · ${p.sku}`,
        assignedTo: installerId,
        status: "Pending",
        priority: "High",
        dueAt: now(),
        notes: r.reason,
      });
    state.notifications.unshift({
      id: uid("note"),
      title: "Additional product approved",
      body: `${j.number} · ${p.sku} · ${r.quantity} unit(s). Confirm location and scan collection.`,
      taskId: state.tasks.find(
        (t) =>
          t.requestId === r.id && t.workflowAction === "replacement-location",
      ).id,
      userId: installerId,
      page: "picking",
      read: false,
      createdAt: now(),
    });
    markJobProvisional(j);
    log(
      "Product request approved",
      "Job",
      j.number,
      `${p.sku} · ${r.quantity} · unit including tax ${money(r.unitGross)} · ${note}`,
    );
    save();
    return true;
  }
  function approveReturnSKU(req, installerId, note) {
    const j = jobOf(req.jobId),
      p = state.products.find((p) => p.id === req.productId);
    const item = {
      id: uid("return-only-item"),
      productId: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      quantityRequired: 0,
      quantityPicked: 0,
      quantityIssued: 0,
      quantityUsed: 0,
      unitGross: 0,
      requestId: req.id,
      approvedReturnOnly: true,
      returnAuthorizedQty: req.quantity,
    };
    j.extraItems = j.extraItems || [];
    j.extraItems.push(item);
    const r = {
      id: uid("return"),
      number: `RET-${String(Math.max(42, ...state.returns.map((x) => Number(x.number?.replace(/\D/g, "")) || 0)) + 1).padStart(6, "0")}`,
      flowVersion: 2,
      jobId: j.id,
      status: "Pickup assigned",
      requestedBy: req.requestedBy,
      reason: req.reason,
      condition: "Other",
      method: "Installer pickup",
      pickupInstallerId: installerId,
      warehouse: returnWarehouses()[0],
      managerId: currentUser().id,
      items: [
        {
          jobItemId: item.id,
          productId: p.id,
          quantity: req.quantity,
          pickupMatched: 0,
        },
      ],
      forms: [],
      createdAt: now(),
      sourceRequestId: req.id,
    };
    state.returns.unshift(r);
    req.sourceReturnId = req.returnId;
    req.returnId = r.id;
    req.status = "Return pickup assigned";
    req.installerId = installerId;
    req.unitGross = 0;
    completeRequestTasks(req, ["replacement-approval"]);
    const t = returnTask(
      r,
      "return-pickup",
      installerId,
      `Scan and collect approved new-SKU return ${p.sku} · ${j.number}`,
    );
    returnTask(
      r,
      "return-receive",
      currentUser().id,
      `Receive and inspect ${r.number}`,
    );
    state.notifications.unshift({
      id: uid("note"),
      title: "Different-SKU return approved",
      body: `${j.number} · ${p.sku} · ${req.quantity}. Scan collection and upload the return form.`,
      page: "returns",
      returnId: r.id,
      taskId: t.id,
      userId: installerId,
      read: false,
      createdAt: now(),
    });
    returnEvent(
      r,
      "Different-SKU return approved",
      `${p.sku} · ${req.quantity} · ${note}. No outbound issue or original invoice credit was fabricated.`,
    );
    markJobProvisional(j);
    save();
    return true;
  }
  function returnHasSupply(j) {
    return (
      !!j.collectionIssuedAt ||
      (j.extraItems || []).some(
        (x) => x.quantityIssued > 0 || x.returnAuthorizedQty > 0,
      )
    );
  }
  function cancelProductRequest(id, reason) {
    if (inventoryControls)
      return deniedWorkflow(
        "Use normalized inventory commands. This legacy job/receipt needs explicit mapping before stock can change.",
      );
    const r = requestOf(id);
    if (
      !canManageJobDetails() ||
      !r ||
      r.direction === "return" ||
      !["Approved", "Ready for Collection"].includes(r.status) ||
      r.matched ||
      !String(reason || "").trim()
    )
      return deniedWorkflow(
        "Management can cancel an uncollected request with a reason.",
      );
    const p = state.products.find((p) => p.id === r.productId);
    if (p)
      p.reserved = Math.max(0, p.reserved - Number(r.reservedQuantity || 0));
    r.reservedQuantity = 0;
    r.status = "Cancelled";
    r.cancelReason = reason;
    completeRequestTasks(r, [
      "replacement-location",
      "replacement-scan",
      "replacement-restock",
    ]);
    log(
      "Approved product request cancelled",
      "Job",
      jobOf(r.jobId)?.number,
      reason,
    );
    save();
    return true;
  }
  function canCollectRequest(r) {
    return (
      canViewProductRequest(r) &&
      hasCapability("picking_scan") &&
      (r.installerId === currentUser()?.id || isStatusAdmin())
    );
  }
  function openProductRequest(id) {
    const r = requestOf(id);
    if (!canViewProductRequest(r) || !allowedPage("picking"))
      return deniedWorkflow("This product request is not available.");
    ui.productRequestId = id;
    ui.workContext = null;
    route("picking");
    return true;
  }
  function confirmRequestLocation(id, location) {
    const r = requestOf(id);
    if (
      !canCollectRequest(r) ||
      jobOf(r.jobId)?.financialHold ||
      ["Completed", "On Hold"].includes(jobOf(r.jobId)?.status) ||
      r.status !== "Approved" ||
      location !==
        `${r.productSnapshot.warehouse} · ${r.productSnapshot.location}`
    )
      return deniedWorkflow("Confirm the approved product warehouse location.");
    r.pickupConfirmedAt = now();
    r.status = "Ready for Collection";
    completeRequestTasks(r, ["replacement-location"]);
    save();
    return true;
  }
  function scanProductRequest(id, code, quantity = 1) {
    if (inventoryControls)
      return {
        ok: false,
        text: "Use the normalized job issue command; legacy references need review.",
      };
    const r = requestOf(id),
      p = r && state.products.find((p) => p.id === r.productId),
      qty = Number(quantity);
    if (
      !canCollectRequest(r) ||
      !p ||
      jobOf(r.jobId)?.financialHold ||
      ["Completed", "On Hold"].includes(jobOf(r.jobId)?.status) ||
      r.status !== "Ready for Collection" ||
      !r.pickupConfirmedAt
    )
      return {
        ok: false,
        text: "Confirm the approved pickup location before scanning.",
      };
    if (
      ![r.productSnapshot.sku, r.productSnapshot.barcode].some(
        (x) => x && x.toLowerCase() === String(code).trim().toLowerCase(),
      ) ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      qty > r.quantity - r.matched
    )
      return {
        ok: false,
        text: "Enter the approved SKU / barcode and an unmatched positive quantity.",
      };
    const available = p.onHand - Math.max(0, p.reserved - r.reservedQuantity);
    if (available < r.quantity) {
      let t = state.tasks.find(
        (t) =>
          t.requestId === r.id && t.workflowAction === "replacement-restock",
      );
      if (!t) {
        t = {
          id: uid("task"),
          requestId: r.id,
          jobId: r.jobId,
          jobStage: "Installation in Progress",
          category: "Warehouse",
          workflowAction: "replacement-restock",
          title: `Urgent restock ${p.sku} for approved pickup`,
          assignedTo: returnManager(),
          status: "Pending",
          priority: "Urgent",
          dueAt: now(),
          notes: `${Math.max(0, r.quantity - available)} additional units required.`,
        };
        state.tasks.unshift(t);
        managementStockNote({
          kind: "replacement-shortage",
          title: "Urgent: additional pickup short of stock",
          body: t.notes,
          page: "picking",
          taskId: t.id,
        });
      }
      save();
      return {
        ok: false,
        text: "Insufficient available stock. An urgent management restock task has been recorded.",
      };
    }
    r.matched += qty;
    if (r.matched === r.quantity) {
      p.onHand -= r.quantity;
      p.reserved = Math.max(0, p.reserved - r.reservedQuantity);
      r.status = "Collected";
      r.issuedAt = now();
      const j = jobOf(r.jobId),
        x = {
          id: uid("extra-item"),
          productId: p.id,
          name: r.productSnapshot.name,
          sku: r.productSnapshot.sku,
          barcode: r.productSnapshot.barcode,
          quantityRequired: r.quantity,
          quantityPicked: r.quantity,
          quantityIssued: r.quantity,
          quantityUsed: 0,
          quantityReturned: 0,
          requestId: r.id,
          unitGross: r.unitGross,
        };
      j.extraItems = j.extraItems || [];
      j.extraItems.push(x);
      state.stockMovements.unshift({
        id: uid("movement"),
        productId: p.id,
        productName: p.name,
        type: "Additional product issue",
        quantity: -r.quantity,
        jobId: j.id,
        requestId: r.id,
        jobItemId: x.id,
        userId: currentUser().id,
        reason: `Approved addition for ${j.number}`,
        createdAt: now(),
      });
      completeRequestTasks(r, ["replacement-scan", "replacement-restock"]);
      j.evidenceRequiredAfter = now();
      ensureInstallationProofTask(state, j);
      const proof = state.tasks.find(
        (t) => t.jobId === j.id && t.workflowAction === "installation-proof",
      );
      if (proof) {
        proof.status = "Pending";
        delete proof.completedAt;
        delete proof.completedBy;
      }
      j.timeline.unshift({
        id: uid("event"),
        title: "Approved additional product collected",
        detail: `${p.sku} · ${r.quantity} · fresh installation evidence required.`,
        at: now(),
        userId: currentUser().id,
      });
      markJobProvisional(j);
    }
    save();
    return {
      ok: true,
      text:
        r.status === "Collected"
          ? "Approved product collected. New installation evidence is required before completion."
          : `${r.matched}/${r.quantity} matched.`,
    };
  }
  function initializeBillingBasis(data, j) {
    if (j.billingBasis) return;
    const q = data.quotes.find(
        (q) => q.id === j.quoteId || q.linkedJobId === j.id,
      ),
      taxable =
        q?.items
          .filter((x) => x.taxable !== false)
          .reduce((n, x) => n + Number(x.lineTotal || 0), 0) || 0,
      taxRate = taxable ? Number(q.gst || 0) / taxable : 0;
    const lines = j.items.map((x) => {
      const rows = q?.items.filter((v) => v.productId === x.productId) || [],
        prices = [
          ...new Set(
            rows.map(
              (v) =>
                Math.round(
                  Number(v.unitPrice) *
                    (1 + (v.taxable !== false ? taxRate : 0)) *
                    100,
                ) / 100,
            ),
          ),
        ];
      return {
        itemId: x.id,
        unitGross:
          prices.length === 1 && Number.isFinite(prices[0]) ? prices[0] : null,
      };
    });
    j.billingBasis = {
      baseTotal: Number(j.value || 0),
      lines,
      source: q?.number || "Legacy job — management confirmation needed",
      confirmed: lines.every((x) => x.unitGross !== null),
      capturedAt: now(),
    };
  }
  function saveBillingBasis(id, total, prices, reason) {
    const j = jobOf(id);
    if (
      !canManageJobDetails() ||
      !hasCapability("billing_manage") ||
      !j ||
      !Number.isFinite(Number(total)) ||
      Number(total) < 0 ||
      !String(reason || "").trim()
    )
      return deniedWorkflow(
        "Enter the original agreed total and a reason for the pricing confirmation.",
      );
    if (j.items.some((x) => String(prices[x.id] ?? "").trim() === ""))
      return deniedWorkflow(
        "Enter each original unit value explicitly; use 0 only when no charge applies.",
      );
    const lines = j.items.map((x) => ({
      itemId: x.id,
      unitGross: Number(prices[x.id]),
    }));
    if (lines.some((x) => !Number.isFinite(x.unitGross) || x.unitGross < 0))
      return deniedWorkflow(
        "Confirm an inclusive unit value for each original product.",
      );
    j.billingBasis = {
      baseTotal: roundMoney(Number(total)),
      lines,
      source: "Management confirmed",
      confirmed: true,
      capturedAt: now(),
      confirmedBy: currentUser().id,
      reason,
    };
    markJobProvisional(j);
    log("Job billing basis confirmed", "Job", j.number, reason);
    save();
    return true;
  }
  function roundMoney(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }
  function finalJobAmounts(j) {
    initializeBillingBasis(state, j);
    const returned = state.returns.filter(
        (r) =>
          r.jobId === j.id && r.status === "Processed" && !r.legacyUnverified,
      ),
      credits = [];
    for (const r of returned) {
      for (const line of r.items || []) {
        const x = allJobItems(j).find((x) => x.id === line.jobItemId),
          rate = x?.requestId
            ? x.unitGross
            : j.billingBasis.lines.find((v) => v.itemId === line.jobItemId)
                ?.unitGross;
        if (r.billingCredit !== false)
          credits.push({
            returnId: r.id,
            number: r.number,
            itemId: line.jobItemId,
            sku: x?.sku || "",
            quantity: line.quantity,
            unitGross: rate,
            amount: roundMoney(line.quantity * Number(rate || 0)),
          });
      }
    }
    const variations = variationAdjustments(j);
    const additions = (j.extraItems || [])
      .filter((x) => !x.approvedReturnOnly)
      .map((x) => ({
        requestId: x.requestId,
        sku: x.sku,
        quantity: x.quantityIssued,
        unitGross: x.unitGross,
        amount: roundMoney(x.quantityIssued * x.unitGross),
      }))
      .concat(variations);
    const credited = roundMoney(credits.reduce((n, x) => n + x.amount, 0)),
      added = roundMoney(additions.reduce((n, x) => n + x.amount, 0)),
      total = roundMoney(j.billingBasis.baseTotal + added - credited);
    return {
      baseTotal: j.billingBasis.baseTotal,
      credits,
      additions,
      credited,
      added,
      total,
      needsReview:
        variations.some((v) => v.needsReview) ||
        !j.billingBasis.confirmed ||
        credits.some((x) => x.unitGross == null) ||
        total < 0,
    };
  }
  function finalFinancialError(j) {
    if (
      (state.productRequests || []).some(
        (r) =>
          r.jobId === j.id &&
          !["Rejected", "Cancelled", "Collected", "Returned"].includes(
            r.status,
          ),
      )
    )
      return "Resolve all additional-product requests and complete their approved collections before final completion.";
    if (
      state.returns.some(
        (r) =>
          r.jobId === j.id && !["Processed", "Cancelled"].includes(r.status),
      )
    )
      return "Finish every return and warehouse inspection before final completion.";
    if (state.returns.some((r) => r.jobId === j.id && r.legacyUnverified))
      return "Reconcile legacy return quantities before final billing.";
    if (finalJobAmounts(j).needsReview)
      return "Management must confirm original product prices and the agreed total before final billing.";
    return "";
  }
  function updateJobBalances(j) {
    const invoices = state.invoices.filter((i) => i.jobId === j.id),
      total = roundMoney(invoices.reduce((n, i) => n + Number(i.total), 0)),
      paid = roundMoney(invoices.reduce((n, i) => n + Number(i.paid || 0), 0));
    let credit = roundMoney(
      invoices.filter((i) => i.total < 0).reduce((n, i) => n - i.total, 0),
    );
    for (const i of invoices
      .filter((i) => i.total >= 0)
      .sort((a, b) => new Date(a.issueDate) - new Date(b.issueDate))) {
      const gross = Math.max(0, roundMoney(i.total - Number(i.paid || 0))),
        applied = Math.min(gross, credit);
      i.creditApplied = roundMoney(applied);
      credit = roundMoney(credit - applied);
      i.balance = roundMoney(gross - applied);
      if (i.balance === 0)
        i.status = i.creditApplied ? "Settled with credit" : "Paid";
      else if (i.paid || i.creditApplied) i.status = "Partially Paid";
    }
    for (const i of invoices.filter((i) => i.total < 0)) {
      i.balance = 0;
      i.status = "Credit issued";
    }
    j.outstanding = Math.max(0, roundMoney(total - paid));
    j.refundDue = Math.max(0, roundMoney(paid - total));
    return { total, paid, outstanding: j.outstanding, refundDue: j.refundDue };
  }
  function finalizeJobBilling(j) {
    const error =
      j.status !== "Completed"
        ? "Complete the job before finalizing billing."
        : finalFinancialError(j) ||
          (j.items.length && !j.collectionIssuedAt
            ? "Complete original product collection."
            : "") ||
          (!hasInstallationProof(j)
            ? "Upload available installation evidence before finalizing billing."
            : "") ||
          (linkedJobTasks(j).some((t) => t.status !== "Completed")
            ? "Complete all linked job tasks before finalizing billing."
            : "");
    if (error) {
      j.finalBillingStatus = "Needs review: " + error;
      return false;
    }
    const amounts = finalJobAmounts(j),
      existing = roundMoney(
        state.invoices
          .filter((i) => i.jobId === j.id)
          .reduce((n, i) => n + Number(i.total), 0),
      ),
      delta = roundMoney(amounts.total - existing),
      key = JSON.stringify(amounts);
    j.finalSettlements = j.finalSettlements || [];
    if (!delta && j.finalSettlements.at(-1)?.key === key) {
      updateJobBalances(j);
      j.finalBillingStatus = "Final";
      return true;
    }
    let doc = null;
    if (delta !== 0) {
      const seq =
        Math.max(
          431,
          ...state.invoices.map(
            (i) => Number(i.number?.replace(/\D/g, "")) || 0,
          ),
        ) + 1;
      doc = {
        id: uid("invoice"),
        number: `${delta < 0 ? "CR" : "INV"}-${String(seq).padStart(6, "0")}`,
        jobId: j.id,
        customer: j.customer,
        type: delta < 0 ? "Credit" : "Final",
        status: delta < 0 ? "Credit issued" : "Draft",
        issueDate: now().slice(0, 10),
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        total: delta,
        paid: 0,
        balance: Math.max(0, delta),
        reminderCount: 0,
        settlementGenerated: true,
        snapshot: JSON.parse(JSON.stringify(amounts)),
        reason:
          "Final job reconciliation after completed returns and product additions",
      };
      state.invoices.unshift(doc);
    }
    const balance = updateJobBalances(j);
    j.finalSettlements.push({
      id: uid("settlement"),
      key,
      at: now(),
      by: currentUser()?.id,
      amounts: JSON.parse(JSON.stringify(amounts)),
      documentId: doc?.id || "",
      previouslyInvoiced: existing,
      adjustment: delta,
      ...balance,
    });
    j.finalBillingStatus = "Final";
    log(
      "Final job billing reconciled",
      "Job",
      j.number,
      `Agreed ${money(amounts.baseTotal)} + additions ${money(amounts.added)} − returns ${money(amounts.credited)} = ${money(amounts.total)}. Adjustment ${money(delta)}; refund/credit due ${money(j.refundDue)}.`,
    );
    return true;
  }

  function migrateReturns(data) {
    for (const r of data.returns) {
      if (r.flowVersion === 2) continue;
      const j = data.jobs.find((j) => j.id === r.jobId);
      r.flowVersion = 2;
      r.forms = [];
      r.requestedBy = j?.installerId || "";
      r.legacyStatus = r.status;
      if (r.status === "Processed") {
        r.items = (j?.items || [])
          .filter((x) => Number(x.quantityReturned) > 0)
          .map((x) => ({
            jobItemId: x.id,
            productId: x.productId,
            quantity: Number(x.quantityReturned),
            pickupMatched: 0,
          }));
        r.legacyUnverified = !r.items.length;
      } else {
        r.status = "Draft";
        r.items = [];
        r.condition = r.condition || "Unused";
        r.migrationNote =
          "Previous return needs product verification. Scan or enter the SKU and submit it for management.";
      }
    }
    return data;
  }
  function returnOf(id) {
    return state.returns.find((r) => r.id === id);
  }
  function returnManager() {
    return (
      ["manager", "admin", "super_admin"]
        .map((role) =>
          state.users.find((u) => u.role === role && u.status === "Active"),
        )
        .find(Boolean)?.id || ""
    );
  }
  function canManageReturns() {
    return (
      !!currentUser() &&
      !isInstaller() &&
      hasCapability("returns_process") &&
      allowedPage("returns")
    );
  }
  function canViewReturn(r) {
    return (
      !!r &&
      !!currentUser() &&
      allowedPage("returns") &&
      (!isInstaller() ||
        r.requestedBy === currentUser().id ||
        jobOf(r.jobId)?.installerId === currentUser().id ||
        r.pickupInstallerId === currentUser().id)
    );
  }
  function canEditReturn(r) {
    return (
      canViewReturn(r) &&
      hasCapability("returns_process") &&
      r.status === "Draft" &&
      (!isInstaller() || jobOf(r.jobId)?.installerId === currentUser().id)
    );
  }
  function canReturnPickup(r) {
    return (
      canViewReturn(r) &&
      hasCapability("returns_process") &&
      hasCapability("picking_scan") &&
      isInstaller() &&
      r.pickupInstallerId === currentUser().id &&
      r.method === "Installer pickup" &&
      r.status === "Pickup assigned"
    );
  }
  function returnWarehouses() {
    return [
      ...new Set(
        [
          ...state.products.map((p) => p.warehouse),
          ...state.jobs.map((j) => j.warehouse),
        ].filter((w) => w && !/\bvan\b/i.test(w)),
      ),
    ];
  }
  function returnUnitsUsed(j, itemId, excludeId) {
    return state.returns
      .filter(
        (r) =>
          r.jobId === j.id && r.id !== excludeId && r.status !== "Cancelled",
      )
      .reduce(
        (n, r) =>
          n +
          (r.items || [])
            .filter((x) => x.jobItemId === itemId)
            .reduce((a, x) => a + Number(x.quantity || 0), 0),
        0,
      );
  }
  function returnAllowance(j, x, excludeId) {
    return Math.max(
      0,
      Number(
        x.returnAuthorizedQty ?? x.quantityIssued ?? x.quantityPicked ?? 0,
      ) - returnUnitsUsed(j, x.id, excludeId),
    );
  }
  function returnEvent(r, title, detail) {
    const at = now(),
      j = jobOf(r.jobId);
    r.events = r.events || [];
    r.events.unshift({ at, title, detail, userId: currentUser()?.id });
    if (j)
      j.timeline.unshift({
        id: uid("event"),
        at,
        title,
        detail: `${r.number} · ${detail}`,
        userId: currentUser()?.id,
      });
    log(title, "Return", r.number, detail);
  }
  function returnTask(r, action, assignee, title) {
    let t = state.tasks.find(
      (t) => t.returnId === r.id && t.workflowAction === action,
    );
    if (!t) {
      t = {
        id: uid("return-task"),
        returnId: r.id,
        jobId: r.jobId,
        jobStage: "Return Pending",
        category: "Return",
        workflowAction: action,
        status: "Pending",
        priority: "High",
        dueAt: now(),
        notes:
          "Complete the required return steps in Returns. Stock is reconciled only after warehouse inspection.",
      };
      state.tasks.unshift(t);
    }
    Object.assign(t, { assignedTo: assignee, title });
    return t;
  }
  function completeReturnTask(r, action) {
    const t = state.tasks.find(
      (t) => t.returnId === r.id && t.workflowAction === action,
    );
    if (t && t.status !== "Completed") {
      t.status = "Completed";
      t.completedAt = now();
      t.completedBy = currentUser()?.id;
      t.completionSource = "Verified return workflow";
    }
  }
  function openReturnWork(id) {
    const r = returnOf(id);
    if (!canViewReturn(r))
      return deniedWorkflow("This return is not assigned to you.");
    ui.returnId = id;
    ui.modal = null;
    ui.drawer = null;
    ui.workContext = null;
    route("returns");
    return true;
  }
  function startReturn(jobId) {
    const j = jobOf(jobId);
    if (
      !canViewJob(j) ||
      !hasCapability("returns_process") ||
      !returnHasSupply(j)
    )
      return deniedWorkflow(
        "Select your job with a recorded product collection.",
      );
    if (state.returns.some((r) => r.jobId === j.id && r.legacyUnverified))
      return deniedWorkflow(
        "Management must reconcile the previous return quantities before another request.",
      );
    let r = state.returns.find((r) => r.jobId === j.id && r.status === "Draft");
    if (!r) {
      r = {
        id: uid("return"),
        number: `RET-${String(Math.max(42, ...state.returns.map((x) => Number(x.number?.replace(/\D/g, "")) || 0)) + 1).padStart(6, "0")}`,
        flowVersion: 2,
        jobId: j.id,
        status: "Draft",
        requestedBy: currentUser().id,
        items: [],
        forms: [],
        createdAt: now(),
        condition: "Unused",
      };
      state.returns.unshift(r);
    }
    ui.returnId = r.id;
    save();
    return r;
  }
  function scanReturn(id, code, quantity = 1) {
    const r = returnOf(id),
      j = r && jobOf(r.jobId),
      qty = Number(quantity),
      key = String(code || "")
        .trim()
        .toLowerCase();
    if (
      !r ||
      !j ||
      !hasCapability("picking_scan") ||
      !(canEditReturn(r) || canReturnPickup(r))
    )
      return {
        ok: false,
        text: "Return scanning is not available to your account at this step.",
      };
    if (!key || !Number.isSafeInteger(qty) || qty <= 0)
      return {
        ok: false,
        text: "Enter a barcode / SKU and a positive whole quantity.",
      };
    const products = allJobItems(j).filter((x) =>
      [x.sku, x.barcode].some(
        (v) => v && String(v).trim().toLowerCase() === key,
      ),
    );
    if (!products.length)
      return {
        ok: false,
        text: "This SKU is not approved for this job. Use the different-product request below; management approval will create its pickup and scan task.",
      };
    if (r.status === "Draft") {
      if (
        !returnHasSupply(j) ||
        state.returns.some((x) => x.jobId === j.id && x.legacyUnverified)
      )
        return {
          ok: false,
          text: "Recorded collection and reconciled return history are required.",
        };
      const capacity = products.reduce(
        (n, x) =>
          n +
          Math.max(
            0,
            returnAllowance(j, x, r.id) -
              (r.items.find((a) => a.jobItemId === x.id)?.quantity || 0),
          ),
        0,
      );
      if (qty > capacity)
        return {
          ok: false,
          text: `Only ${capacity} unit(s) remain eligible for return. Pending and previous returns are included.`,
        };
      let left = qty;
      for (const x of products) {
        let row = r.items.find((a) => a.jobItemId === x.id);
        const add = Math.min(
          left,
          Math.max(0, returnAllowance(j, x, r.id) - (row?.quantity || 0)),
        );
        if (add) {
          if (!row) {
            row = {
              jobItemId: x.id,
              productId: x.productId,
              quantity: 0,
              pickupMatched: 0,
            };
            r.items.push(row);
          }
          row.quantity += add;
          left -= add;
        }
        if (!left) break;
      }
    } else {
      const rows = r.items.filter((x) =>
          products.some((p) => p.id === x.jobItemId),
        ),
        remaining = rows.reduce(
          (n, x) => n + x.quantity - Number(x.pickupMatched || 0),
          0,
        );
      if (qty > remaining)
        return {
          ok: false,
          text: `Only ${remaining} requested unit(s) remain to match.`,
        };
      let left = qty;
      for (const x of rows) {
        const add = Math.min(left, x.quantity - Number(x.pickupMatched || 0));
        x.pickupMatched = Number(x.pickupMatched || 0) + add;
        left -= add;
        if (!left) break;
      }
    }
    r.itemCount = r.items.length;
    r.scanEvents = r.scanEvents || [];
    r.scanEvents.push({
      code: key,
      quantity: qty,
      step: r.status === "Draft" ? "Request" : "Pickup",
      userId: currentUser().id,
      at: now(),
    });
    save();
    return {
      ok: true,
      text:
        r.status === "Draft"
          ? `${qty} unit(s) added to this return request.`
          : `${qty} unit(s) scan matched for pickup.`,
    };
  }
  function submitReturn(id, condition, note = "") {
    const r = returnOf(id);
    if (!canEditReturn(r) || !r.items.length)
      return deniedWorkflow(
        "Scan at least one product before submitting the return.",
      );
    const why = returnReason(condition, note);
    if (!why)
      return deniedWorkflow("Select a return reason and explain Other.");
    r.reason = why;
    const j = jobOf(r.jobId);
    if (
      r.items.some(
        (x) =>
          x.quantity >
          returnAllowance(
            j,
            allJobItems(j).find((i) => i.id === x.jobItemId),
            r.id,
          ),
      )
    )
      return deniedWorkflow(
        "Return quantities exceed the remaining collected products.",
      );
    r.condition = why === "Defective piece" ? "Damaged" : "Unused";
    markJobProvisional(j);
    r.status = "Awaiting manager";
    r.requestedBy = currentUser().id;
    r.submittedAt = now();
    r.managerId = returnManager();
    const t = returnTask(
      r,
      "return-plan",
      r.managerId,
      `Arrange return ${r.number} · ${j.number}`,
    );
    managementStockNote({
      kind: "return-request",
      title: "Return needs a delivery plan",
      body: `${r.number} · ${j.number} · ${r.items.reduce((n, x) => n + x.quantity, 0)} unit(s). Choose client delivery or installer pickup.`,
      page: "returns",
      taskId: t.id,
      returnId: r.id,
    });
    returnEvent(
      r,
      "Return requested",
      `${r.items.length} product line(s) verified. ${r.reason}.`,
    );
    save();
    return true;
  }
  function arrangeReturn(id, method, installerId, warehouse) {
    const r = returnOf(id);
    if (
      !canManageReturns() ||
      !r ||
      ![
        "Awaiting manager",
        "Awaiting client delivery",
        "Pickup assigned",
      ].includes(r.status)
    )
      return deniedWorkflow(
        "This return cannot be assigned at its current step.",
      );
    if (
      !["Client delivery", "Installer pickup"].includes(method) ||
      !returnWarehouses().includes(warehouse)
    )
      return deniedWorkflow("Choose a delivery method and company warehouse.");
    if (r.items.some((x) => Number(x.pickupMatched) > 0))
      return deniedWorkflow(
        "Pickup has started. Finish the assigned collection before changing delivery arrangements.",
      );
    if (
      method === "Installer pickup" &&
      !state.users.some(
        (u) =>
          u.id === installerId &&
          u.role === "installer" &&
          u.status === "Active",
      )
    )
      return deniedWorkflow("Choose an active installer.");
    const old = r.pickupInstallerId;
    r.method = method;
    r.warehouse = warehouse;
    r.managerId = currentUser().id;
    r.pickupInstallerId = method === "Installer pickup" ? installerId : "";
    r.status =
      method === "Installer pickup"
        ? "Pickup assigned"
        : "Awaiting client delivery";
    completeReturnTask(r, "return-plan");
    const existing = state.tasks.find(
      (t) => t.returnId === r.id && t.workflowAction === "return-pickup",
    );
    if (method === "Installer pickup") {
      const t = returnTask(
        r,
        "return-pickup",
        installerId,
        `Collect and deliver ${r.number} to warehouse`,
      );
      if (old !== installerId || t.status === "Completed") {
        t.status = "Pending";
        delete t.completedAt;
        delete t.completedBy;
      }
      state.notifications.unshift({
        id: uid("note"),
        title: "Return pickup assigned",
        body: `${r.number} · ${jobOf(r.jobId)?.number} · Scan the requested products, deliver to ${warehouse}, and upload the return form.`,
        page: "returns",
        returnId: r.id,
        taskId: t.id,
        userId: installerId,
        createdAt: now(),
        read: false,
      });
    } else if (existing) {
      existing.status = "Completed";
      existing.completedAt = now();
      existing.completedBy = currentUser().id;
      existing.completionSource = "Pickup replaced by client delivery";
      existing.assignedTo = "";
    }
    returnTask(
      r,
      "return-receive",
      currentUser().id,
      `Receive and inspect ${r.number}`,
    );
    returnEvent(
      r,
      "Return delivery arranged",
      `${method}${r.pickupInstallerId ? " · " + userName(r.pickupInstallerId) : ""} · ${warehouse}`,
    );
    save();
    return true;
  }
  function cancelReturn(id) {
    const r = returnOf(id);
    if (
      !r ||
      !(canEditReturn(r) || canManageReturns()) ||
      ![
        "Draft",
        "Awaiting manager",
        "Awaiting client delivery",
        "Pickup assigned",
      ].includes(r.status) ||
      r.items.some((x) => x.pickupMatched > 0)
    )
      return deniedWorkflow("Only uncollected returns can be cancelled.");
    r.status = "Cancelled";
    if (r.sourceRequestId) {
      const req = requestOf(r.sourceRequestId);
      if (req) {
        req.status = "Cancelled";
        const x = (jobOf(req.jobId)?.extraItems || []).find(
          (x) => x.requestId === req.id && x.approvedReturnOnly,
        );
        if (x) x.returnAuthorizedQty = 0;
      }
    }
    for (const t of state.tasks.filter(
      (t) => t.returnId === r.id && t.status !== "Completed",
    )) {
      t.status = "Completed";
      t.completedAt = now();
      t.completedBy = currentUser().id;
      t.completionSource = "Return cancelled";
    }
    for (const n of state.notifications.filter((n) => n.returnId === r.id))
      n.resolvedAt = now();
    returnEvent(
      r,
      "Return cancelled",
      "No stock movement was posted; quantities released for future requests.",
    );
    save();
    return true;
  }
  function collectReturn(id) {
    const r = returnOf(id);
    if (
      !canReturnPickup(r) ||
      !r.items.length ||
      r.items.some((x) => x.pickupMatched !== x.quantity)
    )
      return deniedWorkflow(
        "The assigned installer must scan every requested quantity before collection.",
      );
    r.status = "Collected for return";
    r.collectedAt = now();
    const t = state.tasks.find(
      (t) => t.returnId === r.id && t.workflowAction === "return-pickup",
    );
    if (t) t.status = "In Progress";
    returnEvent(
      r,
      "Return products collected",
      "All requested quantities matched. Warehouse handover and return form are still required.",
    );
    save();
    return true;
  }
  function validReturnForm(r) {
    return (r.forms || []).some(
      (f) =>
        f.userId === r.pickupInstallerId &&
        proofAvailability.get(f.blobId) === true,
    );
  }
  function canUploadReturnForm(r) {
    return (
      canViewReturn(r) &&
      isInstaller() &&
      r.pickupInstallerId === currentUser().id &&
      r.method === "Installer pickup" &&
      ["Collected for return", "Delivered"].includes(r.status) &&
      hasCapability("returns_process")
    );
  }
  async function uploadReturnForm(id, file) {
    const r = returnOf(id),
      userId = currentUser()?.id;
    if (!canUploadReturnForm(r))
      return deniedWorkflow(
        "Only the assigned collector can upload the form after collecting the products.",
      );
    let blobId;
    try {
      if (!file || !file.size || file.size > 10 * 1024 * 1024)
        throw Error("Choose a non-empty PDF or image, up to 10 MB.");
      let blob;
      if (file.type === "application/pdf") {
        const head = new TextDecoder().decode(
          await file.slice(0, 5).arrayBuffer(),
        );
        if (head !== "%PDF-") throw Error("This file is not a valid PDF.");
        blob = file;
      } else if (
        ["image/jpeg", "image/png", "image/webp"].includes(file.type)
      ) {
        blob = await (await fetch(await compressPhoto(file))).blob();
      } else throw Error("Upload a PDF, JPEG, PNG or WebP return form.");
      blobId = uid("return-form");
      await proofStore("readwrite", (s) => s.put(blob, blobId));
      if (
        currentUser()?.id !== userId ||
        returnOf(id) !== r ||
        !canUploadReturnForm(r)
      )
        throw Error(
          "The assignment or return stage changed. Upload again from the assigned account.",
        );
      const meta = {
        id: uid("form"),
        blobId,
        userId,
        name: file.name,
        type: blob.type,
        createdAt: now(),
      };
      r.forms = r.forms || [];
      r.forms.push(meta);
      try {
        if (cloud) save();
        else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        r.forms.pop();
        throw Error(
          "The form record could not be saved. Free browser storage and try again.",
        );
      }
      proofAvailability.set(blobId, true);
      proofURLs.set(blobId, lifecycle.createObjectURL(blob));
      returnEvent(r, "Return form uploaded", file.name);
      commit("Return form saved and available for management review.");
      return true;
    } catch (e) {
      if (blobId)
        await proofStore("readwrite", (s) => s.delete(blobId)).catch(() => {});
      toast(e.message || "The return form could not be saved.", "error");
      return false;
    }
  }
  function hydrateReturnForms() {
    if (ui.page !== "returns") return;
    const r = returnOf(ui.returnId);
    if (!canViewReturn(r)) return;
    for (const f of r.forms || []) {
      if (!proofAvailability.has(f.blobId)) {
        proofAvailability.set(f.blobId, "checking");
        proofStore("readonly", (s) => s.get(f.blobId))
          .then((blob) => {
            proofAvailability.set(
              f.blobId,
              blob instanceof Blob && blob.size > 0,
            );
            if (blob instanceof Blob && blob.size > 0)
              proofURLs.set(f.blobId, lifecycle.createObjectURL(blob));
            if (
              canViewReturn(r) &&
              ui.page === "returns" &&
              ui.returnId === r.id
            )
              render();
          })
          .catch(() => {
            proofAvailability.set(f.blobId, false);
            if (canViewReturn(r) && ui.returnId === r.id) render();
          });
      }
      const a = root.querySelector(
        `[data-return-form-link="${CSS.escape(f.blobId)}"]`,
      );
      if (a && proofURLs.has(f.blobId)) a.href = proofURLs.get(f.blobId);
    }
  }
  function deliverReturn(id) {
    const r = returnOf(id);
    if (
      r?.status !== "Collected for return" ||
      !canUploadReturnForm(r) ||
      !validReturnForm(r) ||
      r.items.some((x) => x.pickupMatched !== x.quantity)
    )
      return deniedWorkflow(
        "Complete pickup matching and upload an available return form before confirming warehouse handover.",
      );
    r.status = "Delivered";
    r.deliveredAt = now();
    r.deliveredBy = currentUser().id;
    completeReturnTask(r, "return-pickup");
    returnEvent(
      r,
      "Return handed to warehouse",
      `${r.warehouse} · return form saved; awaiting management inspection.`,
    );
    const t = state.tasks.find(
      (t) => t.returnId === r.id && t.workflowAction === "return-receive",
    );
    managementStockNote({
      kind: "return-delivered",
      title: "Returned products await inspection",
      body: `${r.number} has been delivered to ${r.warehouse}. Review the uploaded form and inspect products.`,
      page: "returns",
      returnId: r.id,
      taskId: t?.id,
    });
    save();
    return true;
  }
  function receiveClientReturn(id) {
    const r = returnOf(id);
    if (
      !canManageReturns() ||
      !r ||
      r.status !== "Awaiting client delivery" ||
      r.method !== "Client delivery"
    )
      return deniedWorkflow(
        "Only management can confirm this client delivery.",
      );
    r.status = "Delivered";
    r.deliveredAt = now();
    r.deliveredBy = currentUser().id;
    returnEvent(
      r,
      "Client return received",
      `Client delivered to ${r.warehouse}; awaiting inspection.`,
    );
    save();
    return true;
  }
  function processReturn(id, usable = {}, credit = true) {
    if (inventoryControls)
      return deniedWorkflow(
        "Use normalized inventory commands. This legacy job/receipt needs explicit mapping before stock can change.",
      );
    const r = returnOf(id);
    if (!canManageReturns() || !r || r.status !== "Delivered")
      return deniedWorkflow(
        "Confirm warehouse delivery before inspecting and processing this return.",
      );
    if (r.method === "Installer pickup" && !validReturnForm(r))
      return deniedWorkflow(
        "The saved return form must be available before processing. If it is missing, the assigned installer must upload it again.",
      );
    if (r.inventoryPostedAt || !r.items.length)
      return deniedWorkflow(
        "This return is already posted or has no verified items.",
      );
    const j = jobOf(r.jobId);
    for (const x of r.items) {
      const n = Number(usable[x.jobItemId]);
      if (
        !Number.isSafeInteger(n) ||
        n < 0 ||
        n > x.quantity ||
        !state.products.some((p) => p.id === x.productId)
      )
        return deniedWorkflow(
          "Enter a valid usable quantity for every returned product.",
        );
      if (
        x.quantity >
        returnAllowance(
          j,
          allJobItems(j).find((i) => i.id === x.jobItemId),
          r.id,
        )
      )
        return deniedWorkflow(
          "This return exceeds the original collected quantity.",
        );
    }
    for (const x of r.items) {
      const p = state.products.find((p) => p.id === x.productId),
        n = Number(usable[x.jobItemId]),
        damaged = x.quantity - n;
      p.onHand += n;
      p.damaged = Number(p.damaged || 0) + damaged;
      x.usable = n;
      x.damaged = damaged;
      state.stockMovements.unshift({
        id: uid("movement"),
        productId: p.id,
        productName: p.name,
        type: n ? "Return to stock" : "Damaged return",
        quantity: n,
        damagedQuantity: damaged,
        reason: `${r.number}: ${n} usable, ${damaged} damaged/quarantined. Received at ${r.warehouse}.`,
        userId: currentUser().id,
        jobId: j.id,
        jobItemId: x.jobItemId,
        returnId: r.id,
        createdAt: now(),
      });
    }
    r.billingCredit = credit !== false;
    r.status = "Processed";
    if (r.sourceRequestId) {
      const req = requestOf(r.sourceRequestId);
      if (req) req.status = "Returned";
    }
    markJobProvisional(j);
    r.inventoryPostedAt = now();
    r.processedBy = currentUser().id;
    completeReturnTask(r, "return-receive");
    returnEvent(
      r,
      "Return inspected and processed",
      "Usable products restored once; damaged products excluded from available stock.",
    );
    save();
    return true;
  }
  function reconcileLegacyReturn(id, quantities, reason) {
    const r = returnOf(id),
      j = r && jobOf(r.jobId);
    if (
      !canManageReturns() ||
      !r?.legacyUnverified ||
      !j ||
      !String(reason || "").trim()
    )
      return deniedWorkflow("Management must enter a reconciliation note.");
    const items = [];
    for (const x of allJobItems(j)) {
      const n = Number(quantities[x.id]);
      if (
        !Number.isSafeInteger(n) ||
        n < 0 ||
        n > Number(x.quantityIssued ?? x.quantityPicked ?? 0)
      )
        return deniedWorkflow("Enter valid historical return quantities.");
      if (n)
        items.push({ jobItemId: x.id, productId: x.productId, quantity: n });
    }
    r.items = items;
    r.legacyUnverified = false;
    r.reconciliationNote = reason;
    returnEvent(
      r,
      "Legacy return quantities reconciled",
      reason + " · Inventory was not changed.",
    );
    save();
    return true;
  }

  function performAdditionScan(code) {
    stopCamera();
    const result = scanProductRequest(
      ui.productRequestId,
      code,
      $("#scan-quantity")?.value || 1,
    );
    save();
    render();
    toast(result.text, result.ok ? "success" : "error");
  }
  function performReturnScan(code) {
    stopCamera();
    const result = scanReturn(
      ui.returnId,
      code,
      $("#scan-quantity")?.value || 1,
    );
    save();
    render();
    toast(result.text, result.ok ? "success" : "error");
  }

  async function copyDocumentContent(button) {
    const modal = button.closest(".modal"),
      source =
        modal?.querySelector(".email-sheet") ||
        modal?.querySelector(".modal-body");
    if (!source) return toast("No document content is available.", "error");
    const copy = source.cloneNode(true);
    copy
      .querySelectorAll(
        "button,input,select,textarea,.email-toolbar,.customer-actions,.document-tools",
      )
      .forEach((x) => x.remove());
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;width:900px";
    holder.append(copy);
    document.body.append(holder);
    const text = copy.innerText.trim(),
      html = copy.innerHTML;
    holder.remove();
    if (!text) return toast("Document is empty.", "error");
    try {
      if (navigator.clipboard?.write && window.ClipboardItem)
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([text], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
      else if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(text);
      else throw Error("Clipboard unavailable");
      toast("Document content copied.");
    } catch (e) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px";
      document.body.append(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (copied) toast("Document content copied.");
      else {
        ui.child = { type: "copyText", text };
        render();
        toast("Select and copy the document text below.");
      }
    }
  }

  function canConfigureEmail() {
    return (
      !!currentUser() &&
      (hasFullStaffAccess() ||
        ["manager", "admin", "super_admin"].includes(state.session?.role)) &&
      allowedPage("email")
    );
  }
  function updatePOSupplierInfo(row) {
    const supplier = state.suppliers.find(
      (x) => x.id === row.querySelector("[name=skuSupplierId]").value,
    );
    row.querySelector("[data-po-supplier-info]").textContent = supplier
      ? `${supplier.name} · ${supplier.email || "No email"} · ${supplier.phone || "No phone"} · ${supplier.contact || "No contact"}`
      : "No supplier assigned to this SKU.";
  }

  async function emailConfigAction(a, id, el) {
    if (!canConfigureEmail())
      return toast(
        "Email configuration requires a Manager, Admin or Super Admin account.",
        "error",
      );
    if (a === "save-email-config") {
      const f = $("#email-config-form");
      if (!f.reportValidity()) return;
      const c = Object.fromEntries(new FormData(f));
      if (c.serviceUrl && new URL(c.serviceUrl).protocol !== "https:")
        return toast("Use an HTTPS email service URL.", "error");
      state.emailConfig = c;
      log(
        "Email configuration updated",
        "Email",
        "Settings",
        "Sender and SMTP preferences updated.",
      );
      commit("Email settings saved.");
      return;
    }
    const p = state.purchaseOrders.find((x) => x.id === id),
      supplier = state.suppliers.find((x) => x.id === p?.supplierId),
      c = state.emailConfig || {};
    if (!p) return;
    const from = supplier?.poFromEmail || c.poFromEmail || c.fromEmail,
      to = p.supplierEmail || supplier?.email;
    if (!from || !to || !c.serviceUrl)
      return toast(
        "Configure the default PO sender and secure Resend service URL first.",
        "error",
      );
    if (new URL(c.serviceUrl).protocol !== "https:")
      return toast("Use an HTTPS email service URL.", "error");
    if (el.disabled) return;
    el.disabled = true;
    try {
      const response = await fetch(
        c.serviceUrl.replace(/\/$/, "") + "/purchase-orders/send",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseOrderId: p.id,
            fromEmail: from,
            fromName: c.fromName,
            replyTo: c.replyTo,
            to,
            cc: (c.cc || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            bcc: (c.bcc || "")
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
            signature: c.signature || "",
            subject: (c.poSubjectPrefix || "Purchase Order") + " " + p.number,
            document: {
              number: p.number,
              expectedDate: p.expectedDate,
              notes: p.notes,
              items: poLines(p).map((l) => ({
                sku: l.sku,
                name: l.name,
                details: l.details || "",
                quantity: l.quantity,
              })),
            },
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.id)
        throw Error(result.error || "Email service did not confirm sending.");
      p.lastEmail = { id: result.id, sentAt: now(), to };
      log(
        "Purchase order emailed",
        "Purchase Order",
        p.number,
        "Resend accepted supplier email.",
      );
      commit("Supplier email accepted by Resend.");
    } catch (e) {
      toast("Email was not confirmed: " + e.message, "error");
    } finally {
      el.disabled = false;
    }
  }

  function poLines(p) {
    return (
      p.items || [
        {
          productId: p.productId,
          name: state.products.find((x) => x.id === p.productId)?.name || "",
          sku: state.products.find((x) => x.id === p.productId)?.sku || "",
          quantity: p.quantity,
          received: p.received || 0,
        },
      ]
    );
  }

  function poRow() {
    return `<div class="po-line form-grid card card-pad mt12"><div class="field"><label>Product / SKU</label><select class="select" name="productId" data-po-product required><option value="">Select SKU</option>${state.products.map((p) => `<option value="${attr(p.id)}">${esc(p.sku)} — ${esc(p.name)}</option>`).join("")}</select></div><div class="field"><label>Quantity</label><input class="input" name="quantity" type="number" min="1" step="1" value="1" required></div><div class="field"><label>Brand name (internal)</label><input class="input" name="brand" placeholder="Enter SKU brand"></div><div class="field"><label>SKU supplier (internal)</label><select class="select" name="skuSupplierId"><option value="">Not assigned</option>${state.suppliers.map((x) => `<option value="${attr(x.id)}">${esc(x.name)} · ${esc(x.email)}</option>`).join("")}</select><p class="small muted" data-po-supplier-info>Brand and SKU supplier information appear only while creating a PO.</p></div><div class="field"><label>Product details (optional)</label><input class="input" name="details"></div><button class="btn ghost" type="button" data-action="remove-po-line">Remove line</button></div>`;
  }

  function procurementAction(a, id, el) {
    if (!allowedPage("purchasing") || !hasCapability("purchasing_receive"))
      return toast("Purchasing permission required.", "error");
    if (a === "new-po") {
      ui.modal = { type: "newPO" };
      render();
    } else if (a === "new-supplier") {
      ui.modal = { type: "supplier" };
      render();
    } else if (a === "add-po-line")
      $("#po-lines").insertAdjacentHTML("beforeend", poRow());
    else if (a === "remove-po-line") {
      if (root.querySelectorAll(".po-line").length > 1)
        el.closest(".po-line").remove();
      else toast("Keep at least one SKU line.", "error");
    } else if (a === "save-supplier") {
      const f = $("#supplier-form");
      if (!f.reportValidity()) return;
      const v = Object.fromEntries(new FormData(f));
      v.name = v.name.trim();
      if (!v.name) return toast("Company name is required.", "error");
      state.suppliers.push({ id: uid("supplier"), ...v, leadTimeDays: 0 });
      log("Supplier created", "Supplier", v.name, v.email);
      ui.modal = null;
      ui.purchasingTab = "Suppliers";
      commit("Supplier added.");
    } else if (a === "save-po") {
      const f = $("#po-form");
      if (!f.reportValidity()) return;
      const v = Object.fromEntries(new FormData(f)),
        supplier = state.suppliers.find((x) => x.id === v.supplierId);
      if (!supplier) return;
      const items = [...f.querySelectorAll(".po-line")].map((row) => {
        const get = (n) => row.querySelector(`[name="${n}"]`).value,
          p = state.products.find((x) => x.id === get("productId"));
        return {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          details: get("details"),
          quantity: Number(get("quantity")),
          received: 0,
          brand: get("brand").trim(),
          skuSupplierId: get("skuSupplierId"),
        };
      });
      if (items.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0))
        return toast(
          "Enter a positive whole quantity for each product.",
          "error",
        );
      if (new Set(items.map((l) => l.productId)).size !== items.length)
        return toast(
          "Use one line per SKU; combine duplicate quantities.",
          "error",
        );
      const number =
          "PO-" +
          String(
            Math.max(
              89,
              ...state.purchaseOrders.map(
                (p) => Number(p.number.split("-").pop()) || 0,
              ),
            ) + 1,
          ).padStart(6, "0"),
        p = {
          id: uid("po"),
          number,
          supplierId: supplier.id,
          supplierName: supplier.name,
          supplierEmail: supplier.email,
          status: "Ordered",
          items,
          expectedDate: v.expectedDate,
          notes: v.notes,
          createdAt: now(),
          jobId: workJobId() || null,
        };
      for (const l of items) {
        const product = state.products.find((x) => x.id === l.productId);
        product.brand = l.brand;
        product.supplierId = l.skuSupplierId;
      }
      state.purchaseOrders.unshift(p);
      log(
        "Purchase Order created",
        "Purchase Order",
        number,
        `${items.length} SKU lines`,
      );
      ui.modal = { type: "viewPO", id: p.id };
      ui.purchasingTab = "Purchase Orders";
      commit("Purchase order created.");
    } else if (a === "view-po") {
      ui.modal = { type: "viewPO", id };
      render();
    } else if (a === "print-po") window.print();
    else if (a === "email-po") {
      const p = state.purchaseOrders.find((x) => x.id === id),
        email =
          p?.supplierEmail ||
          state.suppliers.find((x) => x.id === p?.supplierId)?.email;
      if (!email) return toast("Supplier email is required.", "error");
      const body =
        `Purchase order ${p.number}\nExpected delivery: ${p.expectedDate}\n\n` +
        poLines(p)
          .map(
            (l) =>
              `${l.sku} — ${l.name} | Qty: ${l.quantity} | ${l.details || ""}`,
          )
          .join("\n") +
        `\n\n${p.notes || ""}\n\n${state.emailConfig?.signature || ""}`;
      location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent((state.emailConfig?.poSubjectPrefix || "Purchase Order") + " " + p.number)}&body=${encodeURIComponent(body)}`;
    }
  }

  function bars(data, coral = false) {
    const max = Math.max(1, ...Object.values(data));
    return `<div class="chart-bars">${Object.entries(data)
      .map(
        ([label, v]) =>
          `<div class="chart-row"><strong>${esc(label)}</strong><div class="bar-track"><div class="bar-fill ${coral ? "coral" : ""}" style="width:${Math.round((v / max) * 100)}%"></div></div><strong>${v}</strong></div>`,
      )
      .join("")}</div>`;
  }
  const CLIENT_REPORT_TYPES = [
    "jobs",
    "tasks",
    "revenue",
    "received",
    "paymentMethods",
    "invoices",
    "receivables",
    "overdue",
    "quotes",
    "leads",
    "sources",
    "returns",
  ];
  function reportClient(x, type) {
    const invoice = state.invoices.find((i) => i.id === x.invoiceId),
      j = type === "jobs" ? x : jobOf(x.jobId || invoice?.jobId),
      linkedLead =
        type === "leads" ? x : leadOf(x.leadId || j?.leadId || invoice?.leadId);
    let l = linkedLead;
    if (!l) {
      const matches = state.leads.filter(
        (a) =>
          (x.customer || invoice?.customer || j?.customer) &&
          a.customer === (x.customer || invoice?.customer || j?.customer),
      );
      if (matches.length === 1) l = matches[0];
    }
    const name =
        l?.customer ||
        x.customer ||
        invoice?.customer ||
        j?.customer ||
        "Unknown client",
      email = l?.email || x.recipientEmail || x.email || j?.email || "",
      phone = l?.phone || j?.phone || x.phone || "",
      address = j?.address
        ? [j.address, j.suburb].filter(Boolean).join(", ")
        : [l?.suburb, l?.postcode].filter(Boolean).join(" ");
    const key = email
      ? "email:" + email.trim().toLowerCase()
      : l
        ? "lead:" + l.id
        : j
          ? "job:" + j.id
          : "record:" + type + ":" + x.id;
    return { key, name, email, phone, address };
  }
  function reportClients() {
    const map = new Map();
    [
      ["leads", state.leads],
      ["jobs", state.jobs.filter(canViewJob)],
      ["quotes", state.quotes],
      ["invoices", state.invoices],
      ["revenue", state.payments],
      ["returns", state.returns || []],
    ].forEach(([type, xs]) =>
      xs.forEach((x) => {
        const c = reportClient(x, type);
        if (c.name === "Unknown client") return;
        const previous = map.get(c.key);
        map.set(c.key, {
          ...c,
          email: c.email || previous?.email || "",
          phone: c.phone || previous?.phone || "",
          address: c.address || previous?.address || "",
        });
      }),
    );
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  const REPORT_TYPES = {
    jobs: "Job report",
    employees: "Employee performance",
    tasks: "Task report",
    revenue: "Revenue & collections",
    invoices: "Invoices & receivables",
    quotes: "Quote pipeline",
    leads: "Leads & sources",
    inventory: "Inventory & low stock",
    purchasing: "Purchase orders",
    returns: "Returns",
    sources: "Lead source performance",
    receivables: "Receivables & ageing",
    received: "Received revenue",
    orders: "Order Received (OR) — PO goods",
    employeeList: "Employee list & status",
    movements: "Stock movements",
    overdue: "Overdue invoices",
    paymentMethods: "Revenue by payment method",
  };
  function reportDate(x, type) {
    return type === "jobs"
      ? x.createdAt || x.timeline?.[0]?.at || x.installationDate
      : type === "tasks"
        ? x.dueAt || x.createdAt
        : ["invoices", "receivables", "overdue"].includes(type)
          ? x.issueDate
          : ["revenue", "received", "paymentMethods"].includes(type)
            ? x.paidAt || x.date || x.createdAt
            : type === "purchasing"
              ? x.createdAt || x.expectedDate
              : x.createdAt;
  }
  function reportMatches(x, type, f) {
    if (
      f.clientKey &&
      CLIENT_REPORT_TYPES.includes(type) &&
      reportClient(x, type).key !== f.clientKey
    )
      return false;
    if (["revenue", "received", "paymentMethods"].includes(type) && !x.jobId) {
      const invoice = state.invoices.find((i) => i.id === x.invoiceId);
      x = { ...x, jobId: invoice?.jobId };
    }
    if (type === "quotes" && !x.jobId)
      x = {
        ...x,
        jobId: state.jobs.find(
          (j) => j.quoteId === x.id || j.leadId === x.leadId,
        )?.id,
      };
    const date = String(reportDate(x, type) || "").slice(0, 10);
    if (
      (f.from || f.to) &&
      (!date || (f.from && date < f.from) || (f.to && date > f.to))
    )
      return false;
    if (f.jobId && (x.jobId || (type === "jobs" ? x.id : "")) !== f.jobId)
      return false;
    if (f.employeeId) {
      const j = jobOf(x.jobId);
      if (
        ![
          x.assignedTo,
          x.installerId,
          x.userId,
          x.createdBy,
          j?.installerId,
          leadOf(x.leadId)?.assignedTo,
        ].includes(f.employeeId)
      )
        return false;
    }
    if (
      f.status &&
      !["revenue", "received", "paymentMethods", "movements"].includes(type) &&
      !String(
        type === "jobs"
          ? `${x.status} ${jobApprovalStatus(x)}`
          : x.status || x.stage || "",
      )
        .toLowerCase()
        .includes(f.status.toLowerCase())
    )
      return false;
    return true;
  }
  function createBusinessReport(f) {
    const type = f.type,
      filter = (xs, t = type) => xs.filter((x) => reportMatches(x, t, f)),
      num = (x) => Number(x) || 0,
      job = (x) =>
        jobOf(
          x.jobId || state.invoices.find((i) => i.id === x.invoiceId)?.jobId,
        )?.number || "—",
      who = (x) =>
        userName(x.assignedTo || x.installerId || x.userId) || "Unassigned";
    let columns = [],
      rows = [],
      summary = [],
      note = "";
    if (type === "jobs") {
      const xs = filter(state.jobs.filter(canViewJob));
      columns = [
        "Job",
        "Customer",
        "Service",
        "Status",
        "Approval",
        "Approved by",
        "Approved at",
        "Installer",
        "Scheduled",
        "Contract value",
        "Outstanding",
      ];
      rows = xs.map((x) => [
        x.number,
        x.customer,
        x.service,
        x.status,
        jobApprovalStatus(x),
        jobApprovals?.approved(x.id)?.reviewer_name || "",
        jobApprovals?.approved(x.id)?.approved_at || "",
        userName(x.installerId),
        fmt(x.installationDate),
        money(x.value),
        money(x.outstanding),
      ]);
      summary = [
        ["Jobs", xs.length],
        ["Completed", xs.filter((x) => x.status === "Completed").length],
        [
          "Pending Approval",
          xs.filter((x) => jobApprovalStatus(x) === "Pending Approval").length,
        ],
        [
          "Approved",
          xs.filter((x) => jobApprovalStatus(x) === "Approved").length,
        ],
        ["Contract value", money(xs.reduce((n, x) => n + num(x.value), 0))],
      ];
      note =
        "Date basis: created date, first timeline event, or installation date when creation date is unavailable. Contract value is not collected revenue.";
    }
    if (type === "tasks") {
      const xs = filter(state.tasks.filter(canViewTask));
      columns = [
        "Task",
        "Category",
        "Job",
        "Employee",
        "Priority",
        "Status",
        "Due",
      ];
      rows = xs.map((x) => [
        x.title,
        x.category,
        job(x),
        who(x),
        x.priority,
        x.status,
        fmt(x.dueAt, true),
      ]);
      summary = [
        ["Tasks", xs.length],
        ["Completed", xs.filter((x) => x.status === "Completed").length],
        [
          "Overdue",
          xs.filter(
            (x) => x.status !== "Completed" && new Date(x.dueAt) < new Date(),
          ).length,
        ],
      ];
      note = "Date basis: task due date.";
    }
    if (type === "leads" || type === "sources") {
      const xs = filter(state.leads, "leads");
      if (type === "leads") {
        columns = [
          "Lead",
          "Customer",
          "Source",
          "Stage",
          "Employee",
          "Service",
          "Estimated value",
          "Created",
        ];
        rows = xs.map((x) => [
          x.number,
          x.customer,
          x.source,
          x.stage,
          who(x),
          x.service,
          money(x.value),
          fmt(x.createdAt),
        ]);
      } else {
        const groups = {};
        xs.forEach((x) => {
          const g =
            groups[x.source || "Unknown"] ||
            (groups[x.source || "Unknown"] = { count: 0, won: 0, value: 0 });
          g.count++;
          g.won += x.stage === "Won" ? 1 : 0;
          g.value += num(x.value);
        });
        columns = ["Source", "Leads", "Won", "Won rate", "Estimated value"];
        rows = Object.entries(groups).map(([k, g]) => [
          k,
          g.count,
          g.won,
          ((100 * g.won) / g.count).toFixed(1) + "%",
          money(g.value),
        ]);
      }
      summary = [
        ["Leads", xs.length],
        ["Won", xs.filter((x) => x.stage === "Won").length],
        ["Estimated value", money(xs.reduce((n, x) => n + num(x.value), 0))],
      ];
      note =
        "Date basis: lead created date. Source conversion uses current Won stage; estimated values are not revenue.";
    }
    if (type === "quotes") {
      const xs = filter(state.quotes);
      columns = [
        "Quote",
        "Customer",
        "Status",
        "Total",
        "Created",
        "Valid until",
      ];
      rows = xs.map((x) => [
        x.number,
        x.customer,
        x.status,
        money(x.total),
        fmt(x.createdAt),
        fmt(x.validUntil),
      ]);
      summary = [
        ["Quotes", xs.length],
        ["Accepted", xs.filter((x) => x.status === "Accepted").length],
        ["Quoted value", money(xs.reduce((n, x) => n + num(x.total), 0))],
      ];
      note =
        "Date basis: quote created date. Quoted values are not collected revenue.";
    }
    if (type === "invoices") {
      const xs = filter(state.invoices);
      columns = [
        "Invoice",
        "Customer",
        "Job",
        "Type",
        "Status",
        "Issued",
        "Due",
        "Invoice total",
        "Balance",
      ];
      rows = xs.map((x) => [
        x.number,
        x.customer,
        job(x),
        x.type,
        x.status,
        fmt(x.issueDate),
        fmt(x.dueDate),
        money(x.total),
        money(x.balance),
      ]);
      summary = [
        ["Invoices", xs.length],
        [
          "Outstanding",
          money(xs.reduce((n, x) => n + Math.max(0, num(x.balance)), 0)),
        ],
        [
          "Overdue balance",
          money(
            xs
              .filter(
                (x) => num(x.balance) > 0 && new Date(x.dueDate) < new Date(),
              )
              .reduce((n, x) => n + num(x.balance), 0),
          ),
        ],
      ];
      note =
        "Date basis: invoice issue date. Invoice totals include recorded adjustments and may include tax; this is not an accounting profit report.";
    }
    if (type === "revenue") {
      const xs = filter(state.payments);
      columns = ["Payment", "Customer", "Job", "Method", "Amount", "Recorded"];
      rows = xs.map((x) => [
        x.number || x.id,
        x.customer || jobOf(x.jobId)?.customer || "—",
        job(x),
        x.method,
        money(x.amount),
        fmt(reportDate(x, "revenue"), true),
      ]);
      summary = [
        ["Payments", xs.length],
        [
          "Collected payments",
          money(xs.reduce((n, x) => n + num(x.amount), 0)),
        ],
      ];
      note =
        "Cash collections from the payment ledger, not recognized revenue or profit. Date basis: payment date / recorded date. Refunds are included only if recorded as negative ledger amounts.";
    }
    if (type === "inventory") {
      const xs = state.products;
      columns = [
        "SKU",
        "Product",
        "Category",
        "Warehouse",
        "On hand",
        "Reserved",
        "Available",
        "Minimum",
        "Stock alert",
      ];
      rows = xs.map((x) => [
        x.sku,
        x.name,
        x.category,
        x.warehouse,
        x.onHand,
        x.reserved,
        num(x.onHand) - num(x.reserved),
        x.minimum,
        num(x.onHand) - num(x.reserved) < num(x.minimum) ? "Low stock" : "OK",
      ]);
      summary = [
        ["Products", xs.length],
        [
          "Low stock",
          xs.filter((x) => num(x.onHand) - num(x.reserved) < num(x.minimum))
            .length,
        ],
      ];
      note =
        "Current stock snapshot. Date, job, employee and status filters do not apply.";
    }
    if (type === "purchasing") {
      const xs = filter(state.purchaseOrders);
      columns = [
        "PO",
        "Supplier",
        "Status",
        "Expected",
        "SKU",
        "Product",
        "Ordered quantity",
        "Received quantity",
      ];
      xs.forEach((x) =>
        poLines(x).forEach((l) =>
          rows.push([
            x.number,
            x.supplierName ||
              state.suppliers.find((y) => y.id === x.supplierId)?.name ||
              "—",
            x.status,
            fmt(x.expectedDate),
            l.sku,
            l.name,
            l.quantity,
            l.received || 0,
          ]),
        ),
      );
      summary = [
        ["Orders", xs.length],
        ["SKU lines", rows.length],
      ];
      note =
        "Date basis: created date or expected delivery for older POs. Purchase prices are excluded.";
    }
    if (type === "returns") {
      const xs = filter(state.returns || []);
      columns = [
        "Return",
        "Job",
        "Customer",
        "Status",
        "Reason",
        "Product lines",
        "Created",
      ];
      rows = xs.map((x) => [
        x.number,
        job(x),
        jobOf(x.jobId)?.customer || "—",
        x.status,
        x.reason || "—",
        x.items?.length || x.itemCount || 0,
        fmt(x.createdAt),
      ]);
      summary = [["Returns", xs.length]];
      note = "Date basis: return created date.";
    }
    if (type === "employees") {
      const staff = state.users
        .filter((x) => x.role !== "super_admin" || isMasterSession())
        .filter((x) => !f.employeeId || x.id === f.employeeId);
      columns = [
        "Employee",
        "Role",
        "Account status",
        "Assigned jobs",
        "Completed jobs",
        "Assigned tasks",
        "Completed tasks",
        "Overdue tasks",
        "Assigned leads",
      ];
      rows = staff.map((u) => {
        const jf = { ...f, employeeId: u.id, status: "" },
          js = state.jobs
            .filter(canViewJob)
            .filter((x) => reportMatches(x, "jobs", jf)),
          ts = state.tasks
            .filter(canViewTask)
            .filter((x) => reportMatches(x, "tasks", jf)),
          ls = state.leads.filter((x) => reportMatches(x, "leads", jf));
        return [
          u.name,
          roleLabel(u.role),
          u.status,
          js.length,
          js.filter((x) => x.status === "Completed").length,
          ts.length,
          ts.filter((x) => x.status === "Completed").length,
          ts.filter(
            (x) => x.status !== "Completed" && new Date(x.dueAt) < new Date(),
          ).length,
          ls.length,
        ];
      });
      summary = [["Employees", staff.length]];
      note =
        "Assignment workload, not a productivity score. Job date uses creation/schedule; task date uses due date; lead date uses creation. Status filter does not apply.";
    }
    if (type === "receivables" || type === "overdue") {
      const today = new Date().toISOString().slice(0, 10),
        xs = filter(state.invoices).filter(
          (x) =>
            num(x.balance) > 0 &&
            (type !== "overdue" ||
              (x.dueDate && String(x.dueDate).slice(0, 10) < today)),
        ),
        age = (x) =>
          x.dueDate
            ? Math.max(
                0,
                Math.floor(
                  (new Date(today + "T00:00:00Z") -
                    new Date(String(x.dueDate).slice(0, 10) + "T00:00:00Z")) /
                    86400000,
                ),
              )
            : null,
        bucket = (x) =>
          age(x) === null
            ? "No due date"
            : age(x) === 0
              ? "Current"
              : age(x) <= 30
                ? "1–30 days"
                : age(x) <= 60
                  ? "31–60 days"
                  : age(x) <= 90
                    ? "61–90 days"
                    : "90+ days";
      columns = [
        "Invoice",
        "Customer",
        "Job",
        "Status",
        "Due",
        "Days overdue",
        "Ageing bucket",
        "Outstanding",
      ];
      rows = xs.map((x) => [
        x.number,
        x.customer,
        job(x),
        x.status,
        fmt(x.dueDate),
        age(x) ?? "Unknown",
        bucket(x),
        money(x.balance),
      ]);
      summary = [
        ["Open invoices", xs.length],
        [
          "Receivable balance",
          money(xs.reduce((n, x) => n + num(x.balance), 0)),
        ],
        ...[
          "Current",
          "1–30 days",
          "31–60 days",
          "61–90 days",
          "90+ days",
          "No due date",
        ].map((b) => [
          b,
          money(
            xs
              .filter((x) => bucket(x) === b)
              .reduce((n, x) => n + num(x.balance), 0),
          ),
        ]),
      ];
      note =
        "Outstanding balances as of generation, aged by due date. Date filters select invoice issue date, not a historical balance reconstruction.";
    }
    if (type === "received" || type === "paymentMethods") {
      const xs = filter(state.payments);
      columns = [
        "Payment",
        "Customer",
        "Job",
        "Method",
        "Amount received",
        "Payment date",
        "Reference",
      ];
      rows = xs.map((x) => [
        x.number || x.id,
        x.customer || "—",
        job(x),
        x.method,
        money(x.amount),
        fmt(reportDate(x, type)),
        x.reference || "—",
      ]);
      if (type === "paymentMethods") {
        const groups = {};
        xs.forEach((x) => {
          const k = x.method || "Unknown",
            g = groups[k] || (groups[k] = { count: 0, amount: 0 });
          g.count++;
          g.amount += num(x.amount);
        });
        columns = ["Payment method", "Payments", "Total received"];
        rows = Object.entries(groups).map(([k, g]) => [
          k,
          g.count,
          money(g.amount),
        ]);
      }
      summary = [
        ["Payment entries", xs.length],
        [
          "Received revenue / cash collected",
          money(xs.reduce((n, x) => n + num(x.amount), 0)),
        ],
      ];
      note =
        "Received payments from the ledger, not profit or recognized accounting revenue. Date basis: payment date / recorded date. Status filter does not apply.";
    }
    if (type === "employeeList") {
      const xs = state.users
        .filter((x) => x.role !== "super_admin" || isMasterSession())
        .filter(
          (x) =>
            (!f.employeeId || x.id === f.employeeId) &&
            (!f.status ||
              String(x.status || "")
                .toLowerCase()
                .includes(f.status.toLowerCase())),
        );
      columns = ["Employee", "Role", "Status", "Email", "Phone", "Last login"];
      rows = xs.map((x) => [
        x.name,
        roleLabel(x.role),
        x.status,
        x.email,
        x.phone || "—",
        x.lastLogin === "Never" ? "Never" : fmt(x.lastLogin, true),
      ]);
      summary = [
        ["Employees", xs.length],
        ["Active", xs.filter((x) => x.status === "Active").length],
        ["Invited", xs.filter((x) => x.status === "Invited").length],
        ["Blocked", xs.filter((x) => x.status === "Blocked").length],
      ];
      note =
        "Current employee directory with account status. Employee and status filters apply; date and job filters do not apply.";
    }
    if (type === "orders") {
      columns = [
        "PO",
        "Supplier",
        "PO status",
        "Receipt date",
        "SKU",
        "Product",
        "Ordered quantity",
        "Receipt quantity",
        "Total received",
        "Remaining quantity",
        "Received by",
      ];
      const matchedPOs = new Set();
      let total = 0,
        unknown = 0;
      state.purchaseOrders.forEach((p) => {
        if (!reportMatches(p, "purchasing", { ...f, from: "", to: "" })) return;
        poLines(p)
          .filter((l) => num(l.received) > 0)
          .forEach((l) => {
            const movements = (state.stockMovements || []).filter(
                (m) =>
                  m.type === "Stock received" &&
                  m.productId === l.productId &&
                  (m.purchaseOrderId === p.id ||
                    String(m.reason || "").startsWith(p.number + " ")) &&
                  num(m.quantity) > 0,
              ),
              represented = movements.reduce((n, m) => n + num(m.quantity), 0),
              events = movements.map((m) => ({
                quantity: num(m.quantity),
                date: m.createdAt,
                userId: m.userId,
              }));
            if (num(l.received) > represented)
              events.push({
                quantity: num(l.received) - represented,
                date: l.receivedAt || (!p.items ? p.receivedAt : null),
                userId: null,
              });
            events.forEach((e) => {
              const date = String(e.date || "").slice(0, 10);
              if (
                (f.from || f.to) &&
                (!date || (f.from && date < f.from) || (f.to && date > f.to))
              )
                return;
              rows.push([
                p.number,
                p.supplierName ||
                  state.suppliers.find((x) => x.id === p.supplierId)?.name ||
                  "—",
                p.status,
                e.date ? fmt(e.date, true) : "Not recorded",
                l.sku,
                l.name,
                l.quantity,
                e.quantity,
                l.received,
                Math.max(0, num(l.quantity) - num(l.received)),
                e.userId ? userName(e.userId) : "Not recorded",
              ]);
              matchedPOs.add(p.id);
              total += e.quantity;
              if (!e.date) unknown++;
            });
          });
      });
      summary = [
        ["POs with receipts", matchedPOs.size],
        ["Receipt lines", rows.length],
        ["Units received in selection", total],
        ["Undated receipt lines", unknown],
      ];
      note =
        "OR means Order Received: actual PO stock receipts. Date filters use receipt timestamps; undated legacy receipts appear only with All dates. Total received and remaining quantities show current cumulative PO line balances; receipt quantity is the quantity in that receipt event.";
    }

    if (type === "movements") {
      const xs = filter(state.stockMovements || []);
      columns = [
        "Date",
        "SKU",
        "Product",
        "Movement",
        "Quantity",
        "Job",
        "Employee",
        "Reason",
      ];
      rows = xs.map((x) => [
        fmt(x.createdAt, true),
        state.products.find((p) => p.id === x.productId)?.sku || "—",
        x.productName,
        x.type,
        x.quantity,
        job(x),
        who(x),
        x.reason,
      ]);
      summary = [
        ["Movements", xs.length],
        ["Stock in", xs.reduce((n, x) => n + Math.max(0, num(x.quantity)), 0)],
        [
          "Stock out",
          xs.reduce((n, x) => n + Math.abs(Math.min(0, num(x.quantity))), 0),
        ],
      ];
      note =
        "Date basis: stock movement recorded date. Signed quantities are shown as recorded. Status filter does not apply.";
    }
    if (
      [
        "jobs",
        "tasks",
        "revenue",
        "received",
        "invoices",
        "receivables",
        "overdue",
        "quotes",
        "leads",
        "returns",
      ].includes(type)
    ) {
      const pool =
          type === "jobs"
            ? state.jobs
            : type === "tasks"
              ? state.tasks
              : ["revenue", "received"].includes(type)
                ? state.payments
                : ["invoices", "receivables", "overdue"].includes(type)
                  ? state.invoices
                  : type === "quotes"
                    ? state.quotes
                    : type === "leads"
                      ? state.leads
                      : state.returns || [],
        hasClient = columns.includes("Customer");
      columns.push(
        ...(hasClient ? [] : ["Client"]),
        "Client email",
        "Client phone",
        "Client address / location",
      );
      rows = rows.map((row) => {
        const x = pool.find(
            (x) =>
              (x.number || (["tasks"].includes(type) ? x.title : x.id)) ===
              row[0],
          ),
          c = x
            ? reportClient(x, type)
            : { name: "—", email: "", phone: "", address: "" };
        return [
          ...row,
          ...(hasClient ? [] : [c.name]),
          c.email || "—",
          c.phone || "—",
          c.address || "—",
        ];
      });
    }
    return {
      title: REPORT_TYPES[type],
      type,
      filters: f,
      columns,
      rows,
      summary,
      note,
      generatedAt: now(),
    };
  }
  function reportDocument(r) {
    return `<article class="email-sheet"><h2>${esc(r.title)}</h2><p class="small muted">Generated ${fmt(r.generatedAt, true)} · Period ${esc(r.filters.from || "All dates")} to ${esc(r.filters.to || "All dates")}</p><p class="small">Client: ${esc(r.filters.clientKey ? reportClients().find((c) => c.key === r.filters.clientKey)?.name || "Selected client" : "All")} · Job: ${esc(jobOf(r.filters.jobId)?.number || "All")} · Employee: ${esc(r.filters.employeeId ? userName(r.filters.employeeId) : "All")} · Status: ${esc(r.filters.status || "All")}</p>${
      r.filters.clientKey && CLIENT_REPORT_TYPES.includes(r.type)
        ? (() => {
            const c = reportClients().find(
              (c) => c.key === r.filters.clientKey,
            );
            return c
              ? `<div class="client-box"><strong>${esc(c.name)}</strong><p class="small">${esc(c.email || "Email not recorded")} · ${esc(c.phone || "Phone not recorded")}</p><p class="small">${esc(c.address || "Location not recorded")}</p></div>`
              : "";
          })()
        : ""
    }<div class="facts">${r.summary.map(([k, v]) => infoFact(k, String(v))).join("")}</div><p class="small muted">${esc(r.note)}</p><div class="table-wrap"><table class="data-table"><thead><tr>${r.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${r.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(String(c ?? "—"))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${r.columns.length}">No records match these filters.</td></tr>`}</tbody></table></div></article>`;
  }

  function reportAction(a) {
    if (!allowedPage("reports")) return;
    if (a === "generate-report") {
      const f = Object.fromEntries(new FormData($("#business-report-form")));
      if (f.from && f.to && f.from > f.to)
        return toast("From date must be before To date.", "error");
      ui.reportFilters = f;
      ui.reportResult = createBusinessReport(f);
      render();
      toast("Report generated.");
    } else if (a === "preview-report" && ui.reportResult) {
      ui.modal = { type: "businessReport" };
      render();
    } else if (a === "export-report" && ui.reportResult) {
      const r = ui.reportResult,
        cell = (x) => {
          let v = String(x ?? "");
          if (/^[=+@-]/.test(v)) v = "'" + v;
          return '"' + v.replace(/"/g, '""') + '"';
        },
        csv = [r.columns, ...r.rows]
          .map((row) => row.map(cell).join(","))
          .join("\r\n"),
        url = lifecycle.createObjectURL(
          new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
        ),
        link = document.createElement("a");
      link.href = url;
      link.download = `${r.type}-report-${r.generatedAt.slice(0, 10)}.csv`;
      link.click();
      setTimeout(() => lifecycle.revokeObjectURL(url), 1000);
    }
  }

  function chatUsers() {
    const viewer = currentUser();
    if (!viewer) return [];
    return state.users.filter(
      (u) =>
        u.id !== viewer.id &&
        u.status === "Active" &&
        (viewer.role === "super_admin" || u.role !== "super_admin") &&
        (!isInstaller() || ["admin", "manager"].includes(u.role)),
    );
  }
  function chatConversationWith(userId) {
    const me = currentUser()?.id;
    return (
      state.conversations.find(
        (c) =>
          c.memberIds?.length === 2 &&
          c.memberIds.includes(me) &&
          c.memberIds.includes(userId),
      ) || null
    );
  }
  function chatMessagesWith(userId) {
    if (!chatUsers().some((u) => u.id === userId)) return [];
    const c = chatConversationWith(userId);
    return c
      ? state.messages
          .filter((m) => m.conversationId === c.id)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      : [];
  }
  function ensureChatConversation(userId) {
    let c = chatConversationWith(userId);
    if (!c) {
      c = {
        id: uid("chat"),
        memberIds: [currentUser().id, userId],
        updatedAt: now(),
      };
      state.conversations.push(c);
    }
    return c;
  }
  function chatUnreadFor(userId) {
    return chatMessagesWith(userId).filter(
      (m) =>
        m.senderId !== currentUser()?.id &&
        !m.readBy?.includes(currentUser()?.id),
    ).length;
  }
  function chatUnreadCount() {
    const me = currentUser()?.id;
    if (!me) return 0;
    return chatUsers().reduce(
      (n, u) =>
        n +
        chatMessagesWith(u.id).filter(
          (m) => m.senderId !== me && !m.readBy?.includes(me),
        ).length,
      0,
    );
  }

  function markChatRead(userId) {
    const me = currentUser()?.id;
    if (!me) return;
    chatMessagesWith(userId).forEach((m) => {
      if (m.senderId !== me && !m.readBy.includes(me)) m.readBy.push(me);
    });
  }
  function chatPreview(userId) {
    const messages = chatMessagesWith(userId),
      last = messages.at(-1);
    if (!last) return "Start a conversation";
    const prefix = last.senderId === currentUser()?.id ? "You: " : "";
    return `${prefix}${last.text || last.attachments?.[0]?.name || "Attachment"}`;
  }
  function chatSortedUsers() {
    const q = ui.chatSearch.trim().toLowerCase();
    return chatUsers()
      .filter((u) =>
        `${u.name} ${u.email} ${roleLabel(u.role)}`.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const ca = chatConversationWith(a.id),
          cb = chatConversationWith(b.id),
          da = ca ? new Date(ca.updatedAt).getTime() : 0,
          db = cb ? new Date(cb.updatedAt).getTime() : 0;
        return db - da || a.name.localeCompare(b.name);
      });
  }
  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function sendChatMessage(userId) {
    const target = chatUsers().find((u) => u.id === userId),
      message = String(ui.chatMessage || "").trim(),
      attachments = deep(ui.chatAttachmentDrafts || []);
    if (!target) {
      toast("This user is not available for chat.", "error");
      return;
    }
    if (!message && !attachments.length) {
      toast("Write a message or add an attachment.", "error");
      return;
    }
    const c = ensureChatConversation(userId),
      createdAt = now();
    state.messages.push({
      id: uid("msg"),
      conversationId: c.id,
      senderId: currentUser().id,
      text: message,
      attachments,
      createdAt,
      readBy: [currentUser().id],
    });
    c.updatedAt = createdAt;
    ui.chatMessage = "";
    ui.chatAttachmentDrafts = [];
    save();
    render();
  }

  function canManageAccount(target) {
    const actor = currentUser();
    if (
      !actor ||
      !target ||
      !hasCapability("user_manage") ||
      actor.role === "installer" ||
      actor.id === target.id
    )
      return false;
    if (isMasterSession() && target.role !== "super_admin") return true;
    if (target.role === "super_admin") return false;
    if (actor.role === "admin") return true;
    return target.role === "manager" || target.role === "installer";
  }

  function auditLogDisplay(l) {
    const actor = state.users.find((u) => u.id === l.userId),
      protectedActor = actor?.role === "super_admin" && !isMasterSession(),
      actingAs = l.actingAsUserId
        ? state.users.find((u) => u.id === l.actingAsUserId)
        : null;
    let summary = l.summary,
      reference = l.reference,
      user = actor?.name || "System";
    if (protectedActor) {
      summary = String(summary)
        .split(actor.name)
        .join("Privileged administrator")
        .split(actor.email)
        .join("protected account");
      if (reference === actor.email) reference = "Protected account";
      user = "Privileged administrator";
    }
    if (actingAs) user += ` as ${actingAs.name}`;
    return {
      ...l,
      displaySummary: summary,
      displayReference: reference,
      displayUser: user,
    };
  }

  function modalFrame(
    title,
    subtitle,
    body,
    size = "",
    closeAction = "close-modal",
    foot = "",
  ) {
    if (
      body.includes("email-sheet") ||
      /print|download-quote/i.test(foot) ||
      ui.modal?.type === "settlement"
    ) {
      foot +=
        '<button class="btn ghost" data-action="copy-document">Copy Content</button>';
      if (!/print-po|print-document/.test(foot))
        foot +=
          '<button class="btn ghost" data-action="print-document">Print</button>';
    }
    return `<div class="backdrop" data-backdrop="${closeAction}"><section class="modal ${size}" role="dialog" aria-modal="true"><header class="modal-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button class="modal-close" data-action="${closeAction}" aria-label="Close">${icon("x")}</button></header><div class="modal-body">${body}</div>${foot ? `<footer class="modal-foot">${foot}</footer>` : ""}</section></div>`;
  }

  function globalResults() {
    const q = (ui.globalSearch || "").trim().toLowerCase();
    if (!q) return [];
    const installer = state.session.role === "installer",
      u = currentUser(),
      r = [];
    state.jobs.filter(canViewJob).forEach((j) => {
      if (
        `${j.number} ${j.customer} ${j.address} ${j.suburb} ${j.service}`
          .toLowerCase()
          .includes(q)
      )
        r.push({
          title: `${j.number} · ${j.customer}`,
          sub: `${j.service} · ${j.status}`,
          page: "jobs",
          icon: "briefcase",
          action: "open-job-work",
          id: j.id,
        });
    });
    state.tasks.filter(canViewTask).forEach((t) => {
      if (`${t.title} ${t.category} ${t.status}`.toLowerCase().includes(q))
        r.push({
          title: t.title,
          sub: `${t.category} · ${t.status}`,
          page: "tasks",
          icon: "tasks",
          action: "open-task-work",
          id: t.id,
        });
    });
    if (!installer) {
      state.leads.forEach((l) => {
        if (
          `${l.number} ${l.customer} ${l.email} ${l.phone} ${l.suburb}`
            .toLowerCase()
            .includes(q)
        )
          r.push({
            title: `${l.number} · ${l.customer}`,
            sub: `${l.service} · ${l.stage}`,
            page: "leads",
            icon: "users",
          });
      });
      state.invoices.forEach((i) => {
        if (`${i.number} ${i.customer} ${i.status}`.toLowerCase().includes(q))
          r.push({
            title: `${i.number} · ${i.customer}`,
            sub: `${i.status} · ${money(i.balance)} outstanding`,
            page: "billing",
            icon: "receipt",
          });
      });
      state.products.forEach((p) => {
        if (
          `${p.name} ${p.sku} ${p.barcode} ${p.location}`
            .toLowerCase()
            .includes(q)
        )
          r.push({
            title: p.name,
            sub: `${p.sku} · ${p.onHand - p.reserved} available`,
            page: "inventory",
            icon: "box",
          });
      });
    }
    return r.slice(0, 18);
  }

  function localDateInput(value) {
    const d = new Date(value);
    return Number.isFinite(d.getTime())
      ? new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";
  }

  function saveJobForm(id) {
    const j = jobOf(id);
    if (
      !canManageJobDetails() ||
      !canViewJob(j) ||
      ui.modal?.type !== "editJob" ||
      ui.modal.id !== id
    )
      return deniedWorkflow("Job editing is not available to your account.");
    const form = $("#edit-job-form");
    if (!form || !form.reportValidity()) return false;
    const v = formData("#edit-job-form"),
      date = new Date(v.installationDate);
    if (
      !v.customer?.trim() ||
      !v.service?.trim() ||
      !Number.isFinite(date.getTime())
    )
      return deniedWorkflow(
        "Enter a customer, service and valid installation date.",
      );
    if (
      v.installerId !== j.installerId &&
      v.installerId &&
      !state.users.some(
        (u) =>
          u.id === v.installerId &&
          u.role === "installer" &&
          u.status === "Active",
      )
    )
      return deniedWorkflow("Choose an active installer.");
    if (v.installerId !== j.installerId && v.transferTasks !== "on")
      return deniedWorkflow(
        "Confirm the intended transfer of outstanding tasks before reassignment.",
      );
    if (
      (v.latitude &&
        (!Number.isFinite(Number(v.latitude)) ||
          Math.abs(Number(v.latitude)) > 90)) ||
      (v.longitude &&
        (!Number.isFinite(Number(v.longitude)) ||
          Math.abs(Number(v.longitude)) > 180))
    )
      return deniedWorkflow("Enter valid site coordinates.");
    if (!String(v.changeReason || "").trim())
      return deniedWorkflow("Enter a reason for the job changes.");
    const assignmentChange =
      v.installerId !== j.installerId
        ? {
            from: j.installerId || "",
            to: v.installerId,
            transferOutstanding: true,
            reason: v.changeReason.trim(),
            at: now(),
            by: currentUser().id,
          }
        : null;
    const previousInstaller = j.installerId,
      previousDate = j.installationDate,
      newDate = date.toISOString(),
      changes = [];
    const values = {
      customer: v.customer.trim(),
      phone: v.phone.trim(),
      address: v.address.trim(),
      suburb: v.suburb.trim(),
      postcode: String(v.postcode || "").trim(),
      latitude: v.latitude === "" ? null : Number(v.latitude),
      longitude: v.longitude === "" ? null : Number(v.longitude),
      service: v.service.trim(),
      installerId: v.installerId,
      installationDate: newDate,
      warehouse: v.warehouse.trim(),
      notes: v.notes.trim(),
    };
    for (const [key, value] of Object.entries(values)) {
      if ((j[key] || "") !== value)
        changes.push(`${key}: ${j[key] || "Not set"} → ${value || "Not set"}`);
    }
    let reassigned = 0,
      rescheduled = 0;
    for (const t of state.tasks.filter(
      (t) =>
        t.jobId === id &&
        !t.returnId &&
        !t.requestId &&
        t.status !== "Completed",
    )) {
      if (
        previousInstaller !== v.installerId &&
        ((previousInstaller && t.assignedTo === previousInstaller) ||
          (!t.assignedTo &&
            ["Collection", "Installation"].includes(t.category)))
      ) {
        t.assignedTo = v.installerId;
        t.assignmentHistory ||= [];
        t.assignmentHistory.push(assignmentChange);
        reassigned++;
      }
      if (
        newDate !== previousDate &&
        t.jobStage === "Installation in Progress" &&
        new Date(t.dueAt).getTime() === new Date(previousDate).getTime()
      ) {
        t.dueAt = newDate;
        rescheduled++;
      }
    }
    j.items.forEach((x, i) => {
      for (const key of ["room", "measurements"]) {
        const value = String(v[`${key}_${i}`] || "").trim();
        if (x[key] !== value)
          changes.push(
            `${x.name} ${key}: ${x[key] || "Not set"} → ${value || "Not set"}`,
          );
        x[key] = value;
      }
    });
    Object.assign(j, values);
    if (assignmentChange) j.assignmentChange = assignmentChange;
    ensureInstallationProofTask(state, j);
    if (changes.length) {
      const detail = `${v.changeReason}. ${changes.join("; ")}. ${reassigned} unfinished tasks reassigned; ${rescheduled} tasks rescheduled.`;
      j.timeline.unshift({
        id: uid("event"),
        title: "Job details updated",
        detail,
        at: now(),
        userId: currentUser().id,
      });
      log("Job updated", "Job", j.number, detail);
    }
    ui.modal = { type: "job", id };
    ui.jobTab = "overview";
    commit("Job details and linked tasks updated.");
    return true;
  }

  function quotationView(q, l) {
    return `<div class="email-sheet"><div class="email-head"><div><div class="eyebrow">Quotation</div><div class="quote-brand">Interior Blinds &amp; Shutters</div><div class="small muted">Supply, installation, repairs and maintenance</div></div><div class="right"><strong>${q.number}</strong><div class="small muted mt8">Created: ${fmt(q.createdAt)}<br>Valid until: ${fmt(q.validUntil)}<br>Status: ${esc(q.status)}</div></div></div><div class="client-box"><strong style="font-size:18px">${esc(q.customer)}</strong><div class="small muted mt8">${esc(l?.email || q.recipientEmail)}${l?.phone ? `<br>${esc(l.phone)}` : ""}${l ? `<br>${esc(l.suburb)} ${esc(l.postcode)}` : ""}</div></div><div class="table-wrap"><table class="quote-table"><thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Line total</th></tr></thead><tbody>${q.items.map((x) => `<tr><td>${esc(x.description)}${x.sku ? `<div class="secondary-line">${esc(x.sku)}</div>` : ""}</td><td class="right">${x.quantity}</td><td class="right">${money(x.unitPrice)}</td><td class="right">${money(x.lineTotal)}</td></tr>`).join("")}</tbody></table></div><div style="width:min(350px,100%);margin:20px 0 0 auto"><div class="total-row" style="color:var(--sub)"><span>Subtotal</span><strong style="color:var(--ink)">${money(q.subtotal)}</strong></div><div class="total-row" style="color:var(--sub)"><span>GST (10%)</span><strong style="color:var(--ink)">${money(q.gst)}</strong></div><div class="total-row grand" style="color:var(--ink);border-color:var(--navy)"><span>Total</span><strong>${money(q.total)}</strong></div></div>${q.notes ? `<div class="divider"></div><div class="eyebrow" style="color:var(--sub)">Notes</div><p class="small muted" style="line-height:1.7">${esc(q.notes).replace(/\n/g, "<br>")}</p>` : ""}<div class="divider"></div><p class="small muted">This quotation is linked to the CRM lead and remains subject to final site measurements, stock availability and agreed terms.</p></div>`;
  }

  function formData(id) {
    const f = $(id);
    return f ? Object.fromEntries(new FormData(f).entries()) : {};
  }
  function addLead(v) {
    const number = `LEAD-${String(230 + state.leads.length + 1).padStart(6, "0")}`,
      lead = {
        id: uid("lead"),
        number,
        customer: v.customer,
        email: v.email || "",
        phone: v.phone,
        suburb: v.suburb || "",
        postcode: v.postcode || "",
        service: v.service,
        source: "Website",
        priority: v.priority,
        value: Number(v.value) || 0,
        stage: "New Lead",
        assignedTo: state.session.userId,
        createdAt: now(),
        nextFollowUp: new Date(Date.now() + 86400000).toISOString(),
      };
    state.leads.unshift(lead);
    log(
      "Lead created",
      "Lead",
      number,
      `${lead.customer} added as a new ${lead.service} enquiry.`,
    );
    return lead;
  }
  function advanceLead(id) {
    const l = leadOf(id);
    if (!l) return;
    const i = leadStages.indexOf(l.stage);
    l.stage = leadStages[Math.min(i + 1, leadStages.length - 2)] || l.stage;
    log(
      "Lead stage changed",
      "Lead",
      l.number,
      `${l.customer} moved to ${l.stage}.`,
    );
  }
  function canManageJobCreation() {
    return (
      ["admin", "manager", "super_admin"].includes(currentUser()?.role) &&
      (accountSnapshot
        ? accountSnapshot.context.modules.find((m) => m.key === "jobs")
            ?.can_create === true
        : hasCapability("job_manage"))
    );
  }
  function canManageJobDetails() {
    return (
      (hasFullStaffAccess() ||
        ["manager", "admin", "super_admin"].includes(currentUser()?.role)) &&
      hasCapability("job_manage")
    );
  }
  function createJobFromQuote(lead, quote) {
    if (!canManageJobDetails())
      return deniedWorkflow("Only managers or administrators can create jobs.");
    if (
      !lead ||
      !quote ||
      quote.leadId !== lead.id ||
      quote.status !== "Accepted"
    )
      return deniedWorkflow(
        "Accept this quotation before creating its Job Order.",
      );
    const existing =
      jobOf(quote.linkedJobId) ||
      state.jobs.find((j) => j.quoteId === quote.id);
    if (existing) {
      quote.linkedJobId = existing.id;
      return existing;
    }
    const lines = quote.items.filter(
      (x) => companyStockLine(x) && activeLine(x) && Number(x.quantity) > 0,
    );
    if (
      lines.some(
        (x) =>
          !x.productId ||
          !Number.isFinite(Number(x.quantity)) ||
          Number(x.quantity) <= 0,
      ) ||
      !Number.isFinite(Number(quote.total)) ||
      Number(quote.total) < 0
    )
      return deniedWorkflow(
        "This quotation has invalid quantities or totals. Review it before creating a job.",
      );
    const number = `JOB-${String(Math.max(118, ...state.jobs.map((j) => Number(j.number.split("-").pop()) || 0)) + 1).padStart(6, "0")}`,
      jobId = uid("job");
    const activeManagers = state.users.filter(
        (u) =>
          u.status === "Active" &&
          ["manager", "admin", "super_admin"].includes(u.role),
      ),
      manager =
        activeManagers.find((u) => u.id === lead.assignedTo) ||
        activeManagers.find((u) => u.id === currentUser().id) ||
        activeManagers[0],
      installer = state.users.find(
        (u) => u.role === "installer" && u.status === "Active",
      );
    let shortage = false;
    const items = lines.map((x) => {
      const p = state.products.find((y) => y.id === x.productId),
        quantity = Number(x.quantity);
      let reservedNow = 0;
      if (p) {
        reservedNow = Math.min(quantity, Math.max(0, p.onHand - p.reserved));
        if (!inventoryControls) p.reserved += reservedNow;
        if (reservedNow < quantity) shortage = true;
      } else shortage = true;
      return {
        id: uid("job-item"),
        productId: x.productId,
        kind: x.kind,
        requiresInventory: x.requiresInventory !== false,
        fulfilmentSource: x.fulfilmentSource || "company",
        name: x.description,
        sku: x.sku || p?.sku || "",
        barcode: p?.barcode || "",
        quantityRequired: quantity,
        quantityReserved: inventoryControls ? 0 : reservedNow,
        quantityMatched: 0,
        quantityPicked: 0,
        quantityUsed: 0,
        quantityReturned: 0,
        room: "To be confirmed",
        measurements: "To be measured",
      };
    });
    const job = {
      id: jobId,
      collectionFlowVersion: 2,
      workflowVersion: 1,
      number,
      leadId: lead.id,
      quoteId: quote.id,
      customer: lead.customer,
      phone: lead.phone || "",
      address: lead.address || "",
      suburb: [lead.suburb, lead.postcode].filter(Boolean).join(" "),
      service: lead.service,
      status: shortage ? "Stock Shortage" : "Confirmed",
      installerId: installer?.id || "",
      warehouse: "Main Sydney Warehouse",
      installationDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      value: Number(quote.total),
      outstanding: 0,
      financialHold: false,
      notes:
        "Confirm the site address, installer and proposed installation date before scheduling.",
      items,
      photos: [],
      timeline: [
        {
          id: uid("event"),
          title: "Job created from accepted quotation",
          detail: `${quote.number} · ${lead.number}. Installation date is provisional.`,
          at: now(),
          userId: currentUser().id,
        },
      ],
    };
    state.jobs.unshift(job);
    initializeBillingBasis(state, job);
    ensureInstallationProofTask(state, job);
    quote.linkedJobId = jobId;
    lead.stage = "Won";
    const reconciled = reconcileWorkflow(
      job,
      state.tasks.filter((t) => t.jobId === jobId),
      { managerId: manager?.id, shortage },
    );
    Object.assign(job, reconciled.job);
    state.tasks = state.tasks
      .filter((t) => t.jobId !== jobId)
      .concat(reconciled.tasks);
    if (stockFacts(job).outstanding)
      state.pickLists.unshift({
        id: uid("pick-list"),
        number: `PICK-${Date.now()}`,
        jobId,
        assignedTo: manager?.id || "",
        status: "Pending",
        locationScanned: false,
        workflowOrigin: "generated",
      });
    log(
      "Job created",
      "Job",
      number,
      `Created from accepted ${quote.number}; ${state.tasks.filter((t) => t.jobId === jobId).length} stage tasks linked.`,
    );
    return job;
  }

  function convertLeadToJob(id) {
    const lead = leadOf(id),
      quotes = state.quotes.filter(
        (q) => q.leadId === id && q.status === "Accepted",
      );
    if (quotes.length !== 1)
      return deniedWorkflow(
        "Choose an accepted quotation and click its Create job button.",
      );
    return createJobFromQuote(lead, quotes[0]);
  }

  function saveQuote() {
    const d = ui.quoteDraft,
      l = leadOf(d?.leadId);
    if (!d || !l || !d.lines.length) return;
    const items = d.lines
      .filter(
        (x) =>
          x.description.trim() &&
          Number(x.quantity) > 0 &&
          Number(x.unitPrice) >= 0,
      )
      .map((x) => ({
        id: uid("quote-item"),
        kind: x.kind,
        productId: x.productId,
        description: x.description,
        sku: x.sku,
        quantity: Number(x.quantity),
        unitPrice: Number(x.unitPrice),
        taxable: x.taxable !== false,
        lineTotal: Number(x.quantity) * Number(x.unitPrice),
      }));
    if (!items.length) return;
    const subtotal = items.reduce((s, x) => s + x.lineTotal, 0),
      gst = items.reduce((s, x) => s + (x.taxable ? x.lineTotal * 0.1 : 0), 0);
    if (d.editingId) {
      const q = quoteOf(d.editingId);
      if (!q || q.status !== "Draft") return;
      q.items = items;
      q.validUntil = d.validUntil;
      q.notes = d.notes;
      q.subtotal = subtotal;
      q.gst = gst;
      q.total = subtotal + gst;
      q.updatedAt = now();
      log(
        "Quotation updated",
        "Quote",
        q.number,
        `${q.number} draft updated with ${items.length} line item(s).`,
      );
    } else {
      const number = `QUOTE-${String(311 + state.quotes.length + 1).padStart(6, "0")}`,
        createdAt = now();
      state.quotes.unshift({
        id: uid("quote"),
        number,
        leadId: l.id,
        customer: l.customer,
        status: "Draft",
        recipientEmail: l.email,
        validUntil: d.validUntil,
        notes: d.notes,
        items,
        subtotal,
        gst,
        total: subtotal + gst,
        createdAt,
        updatedAt: createdAt,
      });
      log(
        "Quotation drafted",
        "Quote",
        number,
        `${number} created inside ${l.number} with ${items.length} line item(s).`,
      );
    }
    ui.quoteDraft = { leadId: l.id, ...blankDraft(l) };
    commit(
      d.editingId ? "Quotation draft updated." : "Quotation draft created.",
    );
  }
  function markQuoteReady(id) {
    const q = quoteOf(id);
    if (!q || q.status !== "Draft") return;
    q.status = "Ready";
    q.updatedAt = now();
    log("Quotation ready", "Quote", q.number, `${q.number} is ready to send.`);
    commit(`${q.number} marked ready.`);
  }
  function sendQuote(id, email) {
    const q = quoteOf(id);
    if (!q) return { ok: false, message: "Quotation not found." };
    if (!/^\S+@\S+\.\S+$/.test(email))
      return { ok: false, message: "Enter a valid recipient email." };
    if (!["Ready", "Sent"].includes(q.status))
      return { ok: false, message: "Mark the quotation ready before sending." };
    const l = leadOf(q.leadId);
    state.quoteEmailEvents.unshift({
      id: uid("quote-email"),
      quoteId: id,
      recipientEmail: email,
      status: "Simulated",
      provider: "demo",
      message: "Quotation email simulated successfully.",
      createdAt: now(),
    });
    q.recipientEmail = email;
    q.status = "Sent";
    q.sentAt = now();
    q.updatedAt = q.sentAt;
    if (l) {
      l.stage = "Quote Sent";
      if (!q.followUpTaskId) {
        q.followUpTaskId = uid("task");
        state.tasks.unshift({
          id: q.followUpTaskId,
          title: `Follow up ${q.number} with ${l.customer}`,
          category: "Sales",
          status: "Pending",
          priority: "High",
          assignedTo: l.assignedTo,
          leadId: l.id,
          dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
          notes: `Quotation sent to ${email}. Confirm receipt and decision.`,
        });
      }
    }
    notify("Quotation sent", `${q.number} was sent to ${email}.`, "quotes");
    log(
      "Quotation emailed",
      "Quote",
      q.number,
      `${q.number} sent to ${email}; follow-up task created.`,
    );
    return { ok: true, message: `Quotation email simulated for ${email}.` };
  }
  function setQuoteStatus(id, status) {
    if (!hasCapability("quote_manage") || isInstaller())
      return deniedWorkflow(
        "Quotation updates are not available to your account.",
      );
    const q = quoteOf(id);
    if (!q || q.status !== "Sent" || !["Accepted", "Rejected"].includes(status))
      return deniedWorkflow(
        "Only a sent quotation can be accepted or rejected.",
      );
    q.status = status;
    q.updatedAt = now();
    const l = leadOf(q.leadId);
    if (status === "Accepted") {
      q.acceptedAt = now();
      if (l) l.stage = "Won";
      const follow = state.tasks.find((t) => t.id === q.followUpTaskId);
      if (follow) {
        follow.status = "Completed";
        follow.completedAt = now();
        follow.completedBy = currentUser().id;
      }
    }
    if (l && status === "Rejected") l.stage = "Negotiation";
    log(
      "Quotation status changed",
      "Quote",
      q.number,
      `${q.number} changed to ${status}.`,
    );
    return true;
  }

  function setJobStatus(id, status) {
    const j = jobOf(id),
      error = jobTransitionError(j, status);
    if (error) return deniedWorkflow(error, j);
    if (j.status === "Ready for Collection") return confirmCollection(id);
    if (
      ["Installation in Progress", "Repair in Progress"].includes(stageType(j))
    )
      return completeInstallation(id, status);
    recordJobStage(j, status);
    if (
      status === "Picking" &&
      j.items.length &&
      !state.pickLists.some((p) => p.jobId === j.id)
    )
      state.pickLists.unshift({
        id: uid("pick-list"),
        number: `PICK-${String(74 + state.pickLists.length + 1).padStart(6, "0")}`,
        jobId: j.id,
        assignedTo: currentUser().id,
        status: "Pending",
        locationScanned: false,
      });
    return true;
  }

  function completeInstallation(id, requestedTarget) {
    const j = jobOf(id);
    if (!j) return false;
    const target =
        requestedTarget ||
        nextJobStage(j) ||
        (installationHasReturns(j) ? "Return Pending" : "Completed"),
      error = !["Installation in Progress", "Repair in Progress"].includes(
        stageType(j),
      )
        ? "Start the installation stage before completing it."
        : jobTransitionError(j, target);
    if (error) return deniedWorkflow(error, j);
    j.items.forEach((x) => {
      const issued = Number(x.quantityIssued ?? x.quantityPicked ?? 0);
      x.quantityUsed = Math.min(
        issued,
        Math.max(0, Number(ui.jobUsed?.[x.id] ?? issued)),
      );
      x.quantityToReturn = Math.max(0, issued - x.quantityUsed);
    });
    if (
      j.items.some((x) => x.quantityToReturn > 0) &&
      !state.returns.some(
        (r) => r.jobId === id && !["Processed", "Cancelled"].includes(r.status),
      )
    )
      state.returns.unshift({
        id: uid("return"),
        number: `RET-${String(Math.max(42, ...state.returns.map((r) => Number(r.number?.replace(/\D/g, "")) || 0)) + 1).padStart(6, "0")}`,
        jobId: id,
        flowVersion: 2,
        status: "Draft",
        items: [],
        forms: [],
        requestedBy: j.installerId,
        itemCount: 0,
        condition: "Unused",
        createdAt: now(),
      });
    if (
      j.workflowVersion === 1 &&
      state.returns.some(
        (r) => r.jobId === id && !["Processed", "Cancelled"].includes(r.status),
      )
    ) {
      const plan = reconcileWorkflow(j, linkedJobTasks(j), { returns: true });
      Object.assign(j, plan.job);
      state.tasks = state.tasks
        .filter((t) => t.jobId !== id)
        .concat(plan.tasks);
    }
    recordJobStage(j, target);
    log(
      "Field work completed",
      "Job",
      j.number,
      `Installation task gates completed. Next stage: ${target}.`,
    );
    return true;
  }

  function markReturnReceived(id) {
    return deliverReturn(id);
  }
  function receivePO(id) {
    if (inventoryControls)
      return deniedWorkflow(
        "Use normalized inventory commands. This legacy job/receipt needs explicit mapping before stock can change.",
      );
    const po = state.purchaseOrders.find((x) => x.id === id);
    if (!po || po.status === "Received") return;
    const lines = poLines(po);
    if (lines.some((l) => !state.products.some((x) => x.id === l.productId)))
      return toast(
        "A product is unavailable; receipt could not be posted.",
        "error",
      );
    for (const l of lines) {
      const qty = Math.max(0, l.quantity - (l.received || 0)),
        p = state.products.find((x) => x.id === l.productId);
      if (qty <= 0) continue;
      p.onHand += qty;
      l.received = l.quantity;
      l.receivedAt = now();
      po.receivedAt = l.receivedAt;
      state.stockMovements.unshift({
        id: uid("movement"),
        purchaseOrderId: po.id,
        purchaseOrderNumber: po.number,
        productId: p.id,
        productName: p.name,
        type: "Stock received",
        quantity: qty,
        reason: `${po.number} goods receipt`,
        userId: state.session?.userId || "system",
        createdAt: now(),
      });
    }
    if (!po.items) po.received = po.quantity;
    po.status = "Received";
    log(
      "Purchase Order received",
      "Purchase Order",
      po.number,
      `${lines.length} SKU lines received.`,
    );
  }
  function createInvoice(v) {
    const j = jobOf(v.jobId),
      total = Number(v.total) || 0;
    if (!j) return false;
    if (v.type === "Final") {
      if (j.status !== "Completed")
        return deniedWorkflow(
          "The final invoice is reconciled automatically when the job is completed.",
        );
      return finalizeJobBilling(j);
    }
    if (j.status === "Completed")
      return deniedWorkflow(
        "Reopen the job for changes, then reconcile its final invoice.",
      );
    if (total <= 0) return deniedWorkflow("Enter a positive invoice total.");
    const number = `INV-${String(431 + state.invoices.length + 1).padStart(6, "0")}`,
      issue = new Date(),
      due = new Date(issue.getTime() + 7 * 86400000);
    state.invoices.unshift({
      id: uid("invoice"),
      number,
      jobId: j.id,
      customer: j.customer,
      type: v.type,
      status: "Draft",
      issueDate: issue.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      total,
      paid: 0,
      balance: total,
      reminderCount: 0,
    });
    j.outstanding += total;
    log(
      "Invoice created",
      "Invoice",
      number,
      `${v.type} invoice created for ${j.number}.`,
    );
    return true;
  }
  function recordPayment(id, amount, method) {
    const i = state.invoices.find((x) => x.id === id);
    amount = Number(amount);
    if (!i || amount <= 0) return;
    const allocation = Math.min(amount, i.balance);
    i.paid += allocation;
    i.balance = Math.max(0, i.total - i.paid);
    i.status = i.balance === 0 ? "Paid" : "Partially Paid";
    const j = jobOf(i.jobId);
    if (j) j.outstanding = Math.max(0, j.outstanding - allocation);
    const number = `PAY-${String(199 + state.payments.length + 1).padStart(6, "0")}`;
    state.payments.unshift({
      id: uid("payment"),
      number,
      invoiceId: id,
      customer: i.customer,
      amount: allocation,
      method,
      date: new Date().toISOString().slice(0, 10),
      reference: i.number,
    });
    state.chaseActivities.unshift({
      id: uid("chase"),
      invoiceId: id,
      type: "Payment received",
      note: `${method} payment recorded.`,
      createdAt: now(),
      userId: state.session?.userId || "system",
    });
    log(
      "Payment recorded",
      "Invoice",
      i.number,
      `${allocation.toFixed(2)} received via ${method}.`,
    );
    if (j?.finalSettlements?.length) updateJobBalances(j);
  }
  function sendReminder(id) {
    const i = state.invoices.find((x) => x.id === id);
    if (!i) return;
    i.reminderCount++;
    i.lastReminder = now();
    state.chaseActivities.unshift({
      id: uid("chase"),
      invoiceId: id,
      type: "Reminder",
      note: `Payment reminder ${i.reminderCount} sent to ${i.customer}.`,
      createdAt: now(),
      userId: state.session?.userId || "system",
    });
    log(
      "Invoice reminder sent",
      "Invoice",
      i.number,
      `Reminder ${i.reminderCount} sent to ${i.customer}.`,
    );
  }
  function addUser(v) {
    const email = String(v.email || "")
      .trim()
      .toLowerCase();
    if (
      !hasCapability("user_manage") ||
      !String(v.name || "").trim() ||
      !email ||
      email === OWNER_EMAIL ||
      state.users.some((u) => u.email.toLowerCase() === email) ||
      !(
        isMasterSession() || currentUser()?.role === "admin"
          ? ["admin", "manager", "installer"]
          : ["manager", "installer"]
      ).includes(v.role)
    )
      return false;
    v.email = email;
    state.users.unshift({
      id: uid("user"),
      name: v.name,
      email: v.email,
      phone: v.phone || "",
      role: v.role,
      status: "Invited",
      lastLogin: "Never",
      avatar: initials(v.name),
      password: "demo123",
    });
    log(
      "User created",
      "User",
      v.email,
      `${roleLabel(v.role)} invitation created for ${v.name}.`,
    );
    return true;
  }
  function toggleUser(id) {
    const u = state.users.find((x) => x.id === id);
    if (!u || !canManageAccount(u)) return;
    u.status = u.status === "Active" ? "Blocked" : "Active";
    log(
      u.status === "Blocked" ? "User disabled" : "User enabled",
      "User",
      u.email,
      `${u.name} is now ${u.status}.`,
    );
  }
  function resetPassword(id) {
    const u = state.users.find((x) => x.id === id);
    if (!u || !canManageAccount(u)) return;
    log(
      "Password reset sent",
      "User",
      u.email,
      `Password reset email simulated for ${u.name}.`,
    );
    commit(`Password reset email simulated for ${u.name}.`);
  }
  function editUser(id, v) {
    const u = state.users.find((x) => x.id === id);
    if (!u || !isMasterSession() || u.role === "super_admin")
      return { ok: false, message: "This account cannot be edited." };
    if (
      state.users.some(
        (x) =>
          x.id !== id &&
          x.email.toLowerCase() === String(v.email).trim().toLowerCase(),
      )
    )
      return {
        ok: false,
        message: "That email is already used by another account.",
      };
    const before = `${u.name} · ${roleLabel(u.role)}`;
    u.name = String(v.name).trim();
    u.email = String(v.email).trim();
    u.phone = String(v.phone || "").trim();
    u.role = ["admin", "manager", "installer"].includes(v.role)
      ? v.role
      : u.role;
    u.avatar = initials(u.name);
    log(
      "User edited",
      "User",
      u.email,
      `${before} updated to ${u.name} · ${roleLabel(u.role)}.`,
    );
    return { ok: true, message: "User details updated." };
  }
  function changeUserPassword(id, password) {
    const u = state.users.find((x) => x.id === id);
    if (!u || !isMasterSession() || u.role === "super_admin") return false;
    u.password = password;
    log("Password changed", "User", u.email, `Password changed for ${u.name}.`);
    return true;
  }
  function deleteUserAccount(id) {
    const u = state.users.find((x) => x.id === id);
    if (!u || !isMasterSession() || u.role === "super_admin") return false;
    state.leads.forEach((x) => {
      if (x.assignedTo === id) x.assignedTo = "";
    });
    state.tasks.forEach((x) => {
      if (x.assignedTo === id) x.assignedTo = "";
    });
    state.jobs.forEach((x) => {
      if (x.installerId === id) x.installerId = "";
    });
    state.pickLists.forEach((x) => {
      if (x.assignedTo === id) x.assignedTo = "";
    });
    const removedChats = new Set(
      state.conversations
        .filter((c) => c.memberIds.includes(id))
        .map((c) => c.id),
    );
    state.conversations = state.conversations.filter(
      (c) => !removedChats.has(c.id),
    );
    state.messages = state.messages.filter(
      (m) => !removedChats.has(m.conversationId),
    );
    delete state.accessControl.users[id];
    log(
      "User deleted",
      "User",
      u.email,
      `${u.name} (${roleLabel(u.role)}) deleted; linked work was unassigned.`,
    );
    state.users = state.users.filter((x) => x.id !== id);
    return true;
  }
  function beginImpersonation(id) {
    const target = state.users.find((x) => x.id === id),
      master = currentUser();
    if (
      !target ||
      !master ||
      !isMasterSession() ||
      target.role === "super_admin" ||
      target.status !== "Active"
    )
      return false;
    log(
      "Impersonation started",
      "User",
      target.email,
      `${master.name} started an audited session as ${target.name}.`,
    );
    ui.modal = null;
    ui.child = null;
    ui.drawer = null;
    ui.workContext = null;
    ui.workLeadId = "";
    ui.globalSearch = "";
    ui.chatSelectedUserId = null;
    ui.chatThreadUserId = null;
    ui.chatDockOpen = false;
    state.session = {
      userId: target.id,
      role: target.role,
      impersonatorId: master.id,
    };
    ui.page = firstAllowedPage();
    save();
    render();
    toast(`Signed in as ${target.name}.`);
    return true;
  }
  function endImpersonation() {
    if (!isImpersonating()) return false;
    const masterId = state.session.impersonatorId,
      target = currentUser(),
      master = state.users.find((x) => x.id === masterId);
    log(
      "Impersonation ended",
      "User",
      target?.email || "unknown",
      `Audited session as ${target?.name || "user"} ended.`,
    );
    if (
      !master ||
      master.id !== designatedOwner()?.id ||
      !ownerAuthenticated() ||
      !isMasterEntry()
    ) {
      state.session = null;
      save();
      render();
      return false;
    }
    state.session = { userId: master.id, role: master.role };
    ui.page = "master";
    save();
    render();
    toast("Returned to Super Admin.");
    return true;
  }
  function quotationHtmlDocument(q, l) {
    const rows = q.items
      .map(
        (x) =>
          `<tr><td>${esc(x.description)}${x.sku ? `<div class="muted">${esc(x.sku)}</div>` : ""}</td><td class="num">${x.quantity}</td><td class="num">${money(x.unitPrice)}</td><td class="num">${money(x.lineTotal)}</td></tr>`,
      )
      .join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(q.number)} – ${esc(q.customer)}</title><style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');body{font-family:"DM Sans",sans-serif;color:#101828;background:#f4f7fc;margin:0;padding:32px}.sheet{max-width:850px;margin:auto;background:#fff;border:1px solid #d8e2f0;border-radius:18px;padding:42px}.brand{color:#0b1f3a;font-size:28px;font-weight:800}.tag{color:#2f6bff;font-size:12px;font-weight:800;letter-spacing:1.3px}.top{display:flex;justify-content:space-between;gap:30px;flex-wrap:wrap}.meta{font-size:13px;line-height:1.7;color:#667085}.client{margin:34px 0 24px;padding:18px;background:#e9f0ff;border-radius:14px}.client strong{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#0b1f3a;color:#fff;text-align:left;padding:12px;font-size:12px}td{padding:13px 12px;border-bottom:1px solid #d8e2f0;font-size:13px}.num{text-align:right}.muted{font-size:11px;color:#667085;margin-top:4px}.totals{margin-left:auto;margin-top:22px;width:min(100%,350px)}.total-row{display:flex;justify-content:space-between;padding:9px 0}.grand{font-size:20px;font-weight:800;border-top:2px solid #0b1f3a;padding-top:14px}.notes{margin-top:28px;font-size:12px;line-height:1.7;color:#667085}.footer{margin-top:36px;padding-top:18px;border-top:1px solid #d8e2f0;font-size:11px;color:#667085}@media(max-width:600px){body{padding:0}.sheet{border-radius:0;padding:24px}.num{white-space:nowrap}}@media print{.document-tools{display:none}body{background:white;padding:0}.sheet{border:0}}</style></head><body><div class="document-tools" style="max-width:850px;margin:0 auto 16px;display:flex;gap:12px"><button onclick="window.print()">Print</button><button onclick="const t=root.querySelector('.sheet').innerText;navigator.clipboard?.writeText(t).then(()=>this.textContent='Copied').catch(()=>{const a=document.createElement('textarea');a.value=t;document.body.prepend(a);a.select()})||(()=>{const a=document.createElement('textarea');a.value=t;document.body.prepend(a);a.select()})()">Copy Content</button></div><div class="sheet"><div class="top"><div><div class="tag">QUOTATION</div><div class="brand">Interior Blinds &amp; Shutters</div><div class="meta">Supply, installation, repairs and maintenance</div></div><div class="meta"><strong>${esc(q.number)}</strong><br>Created: ${fmt(q.createdAt)}<br>Valid until: ${esc(q.validUntil)}<br>Status: ${esc(q.status)}</div></div><div class="client"><strong>${esc(q.customer)}</strong><div class="meta">${esc(l?.email || q.recipientEmail)}${l?.phone ? `<br>${esc(l.phone)}` : ""}${l ? `<br>${esc(l.suburb)} ${esc(l.postcode)}` : ""}</div></div><table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Line total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="total-row"><span>Subtotal</span><strong>${money(q.subtotal)}</strong></div><div class="total-row"><span>GST (10%)</span><strong>${money(q.gst)}</strong></div><div class="total-row grand"><span>Total</span><span>${money(q.total)}</span></div></div>${q.notes ? `<div class="notes"><strong>Notes</strong><br>${esc(q.notes).replace(/\n/g, "<br>")}</div>` : ""}<div class="footer">This quotation is linked to the CRM lead and remains subject to final site measurements, stock availability and agreed terms.</div></div></body></html>`;
  }
  function downloadQuote(id) {
    const q = quoteOf(id),
      l = q && leadOf(q.leadId);
    if (!q) return;
    const blob = new Blob([quotationHtmlDocument(q, l)], {
        type: "text/html;charset=utf-8",
      }),
      url = lifecycle.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${q.number}-${q.customer.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    lifecycle.revokeObjectURL(url);
    toast("Customer-ready quotation downloaded.");
  }

  function closeModal() {
    ui.modal = null;
    ui.child = null;
    ui.quoteDraft = null;
    ui.jobUsed = {};
    stopCamera();
    render();
  }
  function performScan(value) {
    if (ui.page === "picking" && ui.productRequestId) {
      performAdditionScan(value);
      return;
    }
    if (ui.page === "returns") {
      performReturnScan(value);
      return;
    }
    if (!ui.scanPickId || !String(value || "").trim()) return;
    stopCamera();
    ui.scanMessage = scanPickList(
      ui.scanPickId,
      String(value).trim(),
      $("#scan-quantity")?.value || 1,
    );
    save();
    render();
    toast(ui.scanMessage.text, ui.scanMessage.ok ? "success" : "error");
  }
  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (window.__ibsCameraFrame) {
      cancelAnimationFrame(window.__ibsCameraFrame);
      window.__ibsCameraFrame = null;
    }
  }
  async function startCamera() {
    const cameraContext =
      ui.page +
      ":" +
      (ui.page === "returns"
        ? ui.returnId
        : ui.productRequestId || ui.scanPickId);
    const scanError =
      ui.page === "picking" && ui.productRequestId
        ? canCollectRequest(requestOf(ui.productRequestId)) &&
          requestOf(ui.productRequestId)?.status === "Ready for Collection"
          ? ""
          : "Additional collection is not ready for scanning."
        : ui.page === "returns"
          ? (canEditReturn(returnOf(ui.returnId)) ||
              canReturnPickup(returnOf(ui.returnId))) &&
            hasCapability("picking_scan")
            ? ""
            : "Return scanning is not available at this step."
          : pickScanError(state.pickLists.find((p) => p.id === ui.scanPickId));
    if (scanError) {
      toast(scanError, "error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Camera scanning is not supported by this browser.", "error");
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      const box = $("#camera-box");
      if (
        !box ||
        cameraContext !==
          ui.page +
            ":" +
            (ui.page === "returns"
              ? ui.returnId
              : ui.productRequestId || ui.scanPickId)
      ) {
        stopCamera();
        return;
      }
      box.classList.add("camera-box");
      box.innerHTML = `<video autoplay playsinline muted></video><div class="camera-guide"></div>`;
      const video = $("video", box);
      video.srcObject = mediaStream;
      await video.play();
      const label = $("#camera-label");
      if (label) label.textContent = "Stop camera";
      if ("BarcodeDetector" in window) {
        let detector;
        try {
          detector = new BarcodeDetector({
            formats: [
              "qr_code",
              "ean_13",
              "ean_8",
              "code_128",
              "code_39",
              "upc_a",
              "upc_e",
            ],
          });
        } catch (e) {
          detector = new BarcodeDetector();
        }
        let locked = false;
        const tick = async () => {
          if (!mediaStream) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue && !locked) {
              locked = true;
              performScan(codes[0].rawValue);
              return;
            }
          } catch (e) {}
          window.__ibsCameraFrame = requestAnimationFrame(tick);
        };
        tick();
      } else
        toast(
          "Camera opened. This browser does not support automatic barcode detection; use manual entry or a scanner.",
          "success",
        );
    } catch (e) {
      toast("Camera permission is required for barcode scanning.", "error");
    }
  }
  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 1200,
            scale = Math.min(1, max / Math.max(img.width, img.height)),
            canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas
            .getContext("2d")
            .drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function readChatFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () =>
        resolve({
          id: uid("attachment"),
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: reader.result,
        });
      reader.readAsDataURL(file);
    });
  }
  async function handleChatFiles(fileList) {
    const incoming = [...fileList],
      existing = ui.chatAttachmentDrafts || [],
      maxCount = 3,
      maxBytes = 1.5 * 1024 * 1024;
    if (!incoming.length) return;
    if (existing.length + incoming.length > maxCount) {
      toast("A message can contain up to 3 attachments.", "error");
      return;
    }
    if (
      existing.reduce((s, f) => s + f.size, 0) +
        incoming.reduce((s, f) => s + f.size, 0) >
      maxBytes
    ) {
      toast("Attachments must be 1.5 MB or less in total.", "error");
      return;
    }
    try {
      ui.chatAttachmentDrafts = [
        ...existing,
        ...(await Promise.all(incoming.map(readChatFile))),
      ];
      render();
    } catch (e) {
      toast("The selected attachment could not be read.", "error");
    }
  }

  lifecycle.listen(root, "submit", async (e) => {
    const form = e.target.dataset.form;
    if (!["login", "owner-login", "owner-password"].includes(form)) return;
    e.preventDefault();
    if (form === "login") {
      loginStaff(ui.loginEmail, ui.loginPassword);
      return;
    }
    if (ui.ownerBusy) return;
    const v = Object.fromEntries(new FormData(e.target));
    ui.ownerBusy = true;
    try {
      if (form === "owner-login") {
        ui.ownerError = "";
        if (v.email !== OWNER_EMAIL)
          throw Error("This portal is reserved for the owner account.");
        if (!hostedOwnerMode() && !state.masterAuth) {
          await setOwnerPassword(v.password, v.confirm);
          completeLogin(designatedOwner());
        } else if (!(await loginOwner(v.email, v.password)))
          throw Error("Password is incorrect.");
      } else {
        if (!isMasterSession()) throw Error("Super Admin sign-in required.");
        await setOwnerPassword(v.password, v.confirm, v.current);
        log(
          "Owner password changed",
          "Authentication",
          OWNER_EMAIL,
          hostedOwnerMode()
            ? "Owner updated the Supabase account password."
            : "Owner updated the local portal password.",
        );
        save();
        toast("Owner password updated.");
      }
    } catch (err) {
      ui.ownerError = err.message;
      if (form === "owner-password") toast(err.message, "error");
    } finally {
      ui.ownerBusy = false;
      render();
    }
  });

  lifecycle.listen(root, "click", async (e) => {
    if (e.target.closest("select,input,textarea,label")) return;
    if (
      !accountSnapshot &&
      hostedOwnerMode() &&
      (state.session?.role === "super_admin" ||
        state.session?.impersonatorId) &&
      (e.target.closest("[data-action]") || e.target.closest("[data-page]"))
    ) {
      if (
        e.target.closest("[data-action]")?.dataset.action !== "logout" &&
        !(await ensureHostedOwner(true))
      ) {
        state.session = null;
        stopCamera();
        save();
        render();
        return;
      }
    }
    const pageEl = e.target.closest("[data-page]");
    if (pageEl) {
      e.preventDefault();
      route(pageEl.dataset.page);
      return;
    }
    if (e.target.dataset.backdrop) {
      const a = e.target.dataset.backdrop;
      if (a === "inv-cancel" && inventoryControls) {
        await inventoryControls.handle({ dataset: { action: "inv-cancel" } });
        return;
      }
      if (a === "account-cancel" && accountControls) {
        await accountControls.handle({ dataset: { action: "account-cancel" } });
        return;
      }
      if (a === "close-child") {
        ui.child = null;
        render();
      } else if (a === "close-drawer") {
        ui.drawer = null;
        render();
      } else closeModal();
      return;
    }
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const a = el.dataset.action,
      id = el.dataset.id;
    if (jobApprovals && (await jobApprovals.handle(el))) return;
    if (inventoryControls && (await inventoryControls.handle(el))) return;
    if (
      inventoryControls &&
      (a === "confirm-collection" ||
        (a === "job-status" && el.dataset.status === "Collected"))
    ) {
      ui.modal = null;
      await inventoryControls.handle({
        dataset: { action: "inv-complete_collection", id },
      });
      return;
    }
    if (
      inventoryControls &&
      ["adjust-stock", "post-stock", "receive-po", "process-return"].includes(a)
    ) {
      ui.modal = null;
      route("inventory");
      toast(
        "Use the normalized stock operations and purchasing receipts in Inventory. Legacy references require review.",
        "error",
      );
      return;
    }
    if (a === "reopen-job" && cloud && jobOf(id)?.status === "Completed") {
      await workflowControls.reopen(
        id,
        $("#reopen-reason")?.value,
        $("#reopen-target")?.value,
      );
      return;
    }
    if (
      ["create-quote-job", "convert-lead"].includes(a) &&
      cloud &&
      workflowControls
    ) {
      const quotes =
        a === "create-quote-job"
          ? [quoteOf(id)].filter(Boolean)
          : state.quotes.filter(
              (q) => q.leadId === id && q.status === "Accepted",
            );
      if (quotes.length !== 1) {
        deniedWorkflow(
          "Choose an accepted quotation and click its Create job button.",
        );
        return;
      }
      await workflowControls.fromQuote(quotes[0]);
      return;
    }
    if (masterControls && (await masterControls.handle(el))) return;
    if (workflowControls && (await workflowControls.handle(el))) return;
    if (accountControls) {
      if (await accountControls.handle(el)) return;
      if (a === "new-user") {
        await accountControls.handle({ dataset: { action: "account-create" } });
        return;
      }
      if (
        [
          "new-user",
          "create-user",
          "toggle-user",
          "reset-password",
          "edit-user",
          "save-user-edit",
          "change-password",
          "save-user-password",
          "delete-user",
          "confirm-delete-user",
          "impersonate-user",
          "switch-role",
          "reset-demo",
        ].includes(a) ||
        a.startsWith("ultimate-") ||
        [
          "set-access",
          "clear-access",
          "bulk-access",
          "clear-access-overrides",
        ].includes(a)
      ) {
        toast(
          "Use the account management controls on the Users page.",
          "error",
        );
        return;
      }
    }
    if (!accountSnapshot && isInstaller() && !installerActionAllowed(a)) {
      toast("This action is not available to installers.", "error");
      return;
    }
    if (
      ["open-chat-thread", "select-chat-user"].includes(a) &&
      !chatUsers().some((u) => u.id === id)
    )
      return deniedWorkflow("This conversation is not available to you.");
    const requiredCapability = ACTION_CAPABILITY[a];
    if (
      accountSnapshot &&
      (requiredCapability ||
        /^(new-|save-|create-|approve-|reject-|export-|generate-|preview-)/.test(
          a,
        ))
    )
      await accountControls?.refresh();
    if (!canRunAction(a, el)) {
      toast("This function has been disabled for your account.", "error");
      return;
    }
    if (["generate-report", "preview-report", "export-report"].includes(a)) {
      reportAction(a);
      return;
    }
    if (a === "retry-proof-location") {
      await uploadInstallationProof(id, [], "after");
      return;
    }
    if (a === "copy-document") {
      await copyDocumentContent(el);
      return;
    }
    if (a === "print-document") {
      window.print();
      return;
    }
    if (["save-email-config", "send-po-resend"].includes(a)) {
      await emailConfigAction(a, id, el);
      return;
    }
    if (
      [
        "new-po",
        "new-supplier",
        "add-po-line",
        "remove-po-line",
        "save-po",
        "save-supplier",
        "view-po",
        "print-po",
        "email-po",
      ].includes(a)
    ) {
      procurementAction(a, id, el);
      return;
    }
    if (a.startsWith("ultimate-")) {
      ultimateAction(a, id, el);
      return;
    }
    if (a === "master-view" && isMasterSession()) {
      ui.masterView = el.dataset.view;
      render();
    } else if (a === "master-user-access" && isMasterSession()) {
      ui.accessTarget = id;
      ui.masterView = "Access controls";
      ui.page = "master";
      render();
    } else if (a === "master-open-request" && isMasterSession()) {
      openProductRequest(id);
    } else if (a === "open-task-work") {
      openRelatedWork("task", id);
    } else if (a === "open-job-work") {
      openRelatedWork("job", id);
    } else if (a === "open-stage-work") {
      openRelatedWork("job", id, el.dataset.stage);
    } else if (a === "clear-work-context") {
      route(ui.page);
    } else if (a === "admin-job-status") {
      const value = el
        .closest("[data-status-control]")
        ?.querySelector("[data-admin-job-status]")?.value;
      if (adminSetJobStatus(id, value))
        commit("Job status updated by administrator.");
    } else if (a === "admin-task-status") {
      if (!isStatusAdmin())
        return deniedWorkflow("Only administrators can set task status.");
      const value = el
        .closest("[data-status-control]")
        ?.querySelector("[data-admin-task-status]")?.value;
      if (updateTaskStatus(id, value, true))
        commit("Task status updated by administrator.");
    } else if (a === "select-account") {
      ui.loginEmail = el.dataset.email;
      ui.loginPassword = "demo123";
      ui.loginError = "";
      render();
    } else if (a === "mobile-menu") {
      ui.mobileMenu = !ui.mobileMenu;
      render();
    } else if (a === "open-search") {
      ui.drawer = "search";
      ui.globalSearch = "";
      render();
    } else if (a === "open-notifications") {
      ui.drawer = "notifications";
      render();
    } else if (a === "close-drawer") {
      ui.drawer = null;
      render();
    } else if (a === "open-notification") {
      const n = visibleNotifications().find((x) => x.id === id);
      if (n) {
        if (n.approvalNotification) {
          try {
            await jobApprovals.read(n.id);
          } catch (error) {
            toast(error.message, "error");
            return;
          }
          ui.drawer = null;
          await jobApprovals.handle({
            dataset: { action: "approval-review", id: n.jobId },
          });
          return;
        }
        if (n.audienceRoles) {
          n.readBy = [...new Set([...(n.readBy || []), currentUser().id])];
        } else n.read = true;
        save();
        if (n.kind === "low-stock") {
          ui.workContext = null;
          ui.inventorySearch =
            state.products.find((p) => p.id === n.productId)?.sku || "";
          route("inventory");
        } else if (n.taskId) openRelatedWork("task", n.taskId);
        else {
          const j = n.jobId
            ? jobOf(n.jobId)
            : state.jobs.find((j) => `${n.title} ${n.body}`.includes(j.number));
          if (j && canViewJob(j)) openRelatedWork("job", j.id);
          else route(n.page);
        }
      }
    } else if (a === "toggle-chat-dock") {
      if (ui.chatDockOpen || ui.chatThreadUserId) {
        ui.chatDockOpen = false;
        ui.chatThreadUserId = null;
      } else ui.chatDockOpen = true;
      render();
    } else if (a === "open-chat-thread") {
      if (ui.chatThreadUserId !== id) ui.chatAttachmentDrafts = [];
      ui.chatThreadUserId = id;
      ui.chatSelectedUserId = id;
      ui.chatDockOpen = false;
      markChatRead(id);
      save();
      render();
    } else if (a === "select-chat-user") {
      if (ui.chatSelectedUserId !== id) ui.chatAttachmentDrafts = [];
      ui.chatSelectedUserId = id;
      markChatRead(id);
      save();
      render();
    } else if (a === "chat-back") {
      ui.chatThreadUserId = null;
      ui.chatDockOpen = true;
      ui.chatAttachmentDrafts = [];
      ui.chatMessage = "";
      render();
    } else if (a === "close-chat-dock") {
      ui.chatDockOpen = false;
      ui.chatThreadUserId = null;
      ui.chatAttachmentDrafts = [];
      ui.chatMessage = "";
      render();
    } else if (a === "close-page-chat") {
      ui.chatSelectedUserId = null;
      ui.chatAttachmentDrafts = [];
      ui.chatMessage = "";
      render();
    } else if (a === "chat-attach") {
      el.closest(".chat-composer")?.querySelector("[data-chat-files]")?.click();
    } else if (a === "remove-chat-attachment") {
      ui.chatAttachmentDrafts = (ui.chatAttachmentDrafts || []).filter(
        (x) => x.id !== id,
      );
      render();
    } else if (a === "send-chat") sendChatMessage(id);
    else if (a === "master-access-view" && isMasterSession()) {
      ui.accessView = el.dataset.view;
      render();
    } else if (a === "set-access" && isMasterSession()) {
      setAccessRule(
        ui.accessTarget,
        el.dataset.kind,
        el.dataset.key,
        el.dataset.value === "true",
      );
      commit("Access rule updated.");
    } else if (a === "clear-access" && isMasterSession()) {
      clearAccessRules(ui.accessTarget, el.dataset.kind, el.dataset.key);
      commit("Default access restored.");
    } else if (a === "bulk-access" && isMasterSession()) {
      bulkAccessRules(
        ui.accessTarget,
        el.dataset.kind,
        el.dataset.value === "true",
      );
      commit("Bulk access updated.");
    } else if (a === "clear-access-overrides" && isMasterSession()) {
      clearAccessRules(ui.accessTarget, el.dataset.kind);
      commit("Default access restored.");
    } else if (a === "new-lead") {
      ui.modal = { type: "newLead" };
      render();
    } else if (a === "create-lead") {
      const v = formData("#new-lead-form");
      if (!v.customer || !v.phone) {
        toast("Customer name and phone are required.", "error");
        return;
      }
      const l = addLead(v);
      ui.modal = null;
      save();
      render();
      toast(`${l.number} created.`);
    } else if (a === "open-lead") {
      ui.modal = { type: "lead", id };
      ui.quoteDraft = { leadId: id, ...blankDraft(leadOf(id)) };
      render();
    } else if (a === "manage-quote") {
      const q = quoteOf(id);
      if (q) {
        route("leads");
        ui.modal = { type: "lead", id: q.leadId };
        ui.quoteDraft = { leadId: q.leadId, ...blankDraft(leadOf(q.leadId)) };
        render();
      }
    } else if (a === "add-quote-product") {
      const p = state.products.find((x) => x.id === id),
        d = ui.quoteDraft;
      if (!p || !d) return;
      const found = d.lines.find(
        (x) => x.kind === "Inventory" && x.productId === p.id,
      );
      if (found) found.quantity++;
      else
        d.lines.push({
          localId: uid("line"),
          kind: "Inventory",
          productId: p.id,
          description: p.name,
          sku: p.sku,
          quantity: 1,
          unitPrice: p.salePrice,
          taxable: true,
        });
      render();
    } else if (a === "add-custom-line") {
      const d = ui.quoteDraft;
      if (!d) return;
      const qty = Number(d.customQuantity) || 0,
        price = Number(d.customPrice) || 0;
      if (!d.customDescription.trim() || qty <= 0 || price < 0) {
        toast("Enter a valid description, quantity and price.", "error");
        return;
      }
      d.lines.push({
        localId: uid("line"),
        kind: "Custom",
        description: d.customDescription.trim(),
        quantity: qty,
        unitPrice: price,
        taxable: true,
      });
      d.customDescription = "Installation and service charges";
      d.customQuantity = "1";
      d.customPrice = "250";
      render();
    } else if (a === "remove-quote-line") {
      ui.quoteDraft.lines = ui.quoteDraft.lines.filter((x) => x.localId !== id);
      render();
    } else if (a === "save-quote") saveQuote();
    else if (a === "edit-quote") {
      const q = quoteOf(id);
      if (!q || q.status !== "Draft") return;
      ui.quoteDraft = {
        leadId: q.leadId,
        editingId: q.id,
        lines: q.items.map((x) => ({
          localId: uid("line"),
          kind: x.kind,
          productId: x.productId,
          description: x.description,
          sku: x.sku,
          quantity: x.quantity,
          unitPrice: x.unitPrice,
          taxable: x.taxable,
        })),
        customDescription: "Installation and service charges",
        customQuantity: "1",
        customPrice: "250",
        validUntil: q.validUntil,
        notes: q.notes,
      };
      render();
      const m = $(".modal-body");
      if (m) m.scrollTop = 0;
    } else if (a === "ready-quote") markQuoteReady(id);
    else if (a === "send-quote") {
      ui.child = { type: "sendQuote", id };
      render();
    } else if (a === "confirm-send-quote") {
      const v = formData("#send-quote-form"),
        result = sendQuote(id, String(v.email || "").trim());
      if (!result.ok) {
        toast(result.message, "error");
        return;
      }
      ui.child = null;
      save();
      render();
      toast(result.message);
    } else if (a === "preview-quote") {
      ui.child = { type: "previewQuote", id };
      render();
    } else if (a === "download-quote") downloadQuote(id);
    else if (a === "quote-status") {
      if (setQuoteStatus(id, el.dataset.status))
        commit(
          `${quoteOf(id)?.number} changed to ${el.dataset.status}.${el.dataset.status === "Accepted" ? " Use Create job when ready." : ""}`,
        );
    } else if (a === "convert-lead" || a === "create-quote-job") {
      const q = quoteOf(id),
        j =
          a === "create-quote-job"
            ? createJobFromQuote(leadOf(q?.leadId), q)
            : convertLeadToJob(id);
      if (j) {
        ui.modal = { type: "job", id: j.id };
        ui.jobTab = "overview";
        commit(`${j.number} is linked and ready to review.`);
      }
    } else if (a === "edit-job") {
      if (!canManageJobDetails() || !canViewJob(jobOf(id)))
        return deniedWorkflow("Job editing is not available to your account.");
      ui.modal = { type: "editJob", id };
      render();
    } else if (a === "save-job") {
      saveJobForm(id);
    } else if (a === "open-job") {
      if (!canViewJob(jobOf(id)))
        return deniedWorkflow("This job is not assigned to you.");
      ui.modal = { type: "job", id };
      ui.jobTab = "overview";
      ui.jobUsed = {};
      render();
    } else if (a === "open-installation-proof") {
      if (!canViewJob(jobOf(id)))
        return deniedWorkflow("This job is not assigned to you.");
      ui.modal = { type: "job", id };
      ui.jobTab = "photos";
      render();
    } else if (a === "job-tab") {
      ui.jobTab = el.dataset.tab;
      render();
    } else if (a === "job-status") {
      if (setJobStatus(id, el.dataset.status))
        commit(`${jobOf(id)?.number} moved to ${el.dataset.status}.`);
    } else if (a === "confirm-collection") {
      if (confirmCollection(id)) commit("Installer collection confirmed.");
    } else if (a === "complete-installation") {
      if (completeInstallation(id))
        commit("Installation completed and products reconciled.");
    } else if (a === "new-task") {
      if (state.session.role === "installer")
        return deniedWorkflow(
          "Only managers or administrators can assign tasks.",
        );
      ui.modal = {
        type: "newTask",
        taskId: id || null,
        returnJobId: el.dataset.jobId || null,
      };
      render();
    } else if (a === "create-task") {
      saveTaskForm();
    } else if (a === "task-start") {
      if (updateTaskStatus(id, "In Progress")) commit("Task started.");
    } else if (a === "task-complete") {
      if (updateTaskStatus(id, "Completed"))
        commit("Task completed. The linked job stage has been rechecked.");
    } else if (a === "calendar-view") {
      ui.calendarView = el.dataset.view;
      render();
    } else if (a === "adjust-stock") {
      ui.modal = { type: "stock", id };
      render();
    } else if (a === "post-stock") {
      const p = state.products.find((x) => x.id === id),
        v = formData("#stock-form"),
        qty = Number(v.quantity) || 0;
      if (!p || qty <= 0) {
        toast("Enter a valid quantity.", "error");
        return;
      }
      if (v.type === "Stock increase") p.onHand += qty;
      if (v.type === "Stock reduction" || v.type === "Write-off")
        p.onHand = Math.max(0, p.onHand - qty);
      if (v.type === "Damaged") {
        p.onHand = Math.max(0, p.onHand - qty);
        p.damaged += qty;
      }
      state.stockMovements.unshift({
        id: uid("movement"),
        productId: p.id,
        productName: p.name,
        type: v.type,
        quantity: v.type === "Stock increase" ? qty : -qty,
        reason: v.reason,
        userId: state.session.userId,
        createdAt: now(),
      });
      log(
        "Inventory adjusted",
        "Product",
        p.sku,
        `${v.type}: ${qty}. ${v.reason}`,
      );
      ui.modal = null;
      commit("Stock movement posted.");
    } else if (a === "select-pick") {
      if (!visiblePickLists().some((p) => p.id === id))
        return deniedWorkflow(
          "This Pick List is not available to your account.",
        );
      stopCamera();
      ui.scanPickId = id;
      ui.scanMessage = "";
      render();
    } else if (a === "confirm-pickup-location") {
      if (confirmPickupLocation(id, $("#pickup-location")?.value)) {
        ui.scanMessage = {
          ok: true,
          text:
            jobOf(state.pickLists.find((p) => p.id === id)?.jobId)?.status ===
            "Ready for Collection"
              ? "Pickup location confirmed. Collection scanning is now ready."
              : "Location confirmed. Complete any remaining stage tasks.",
        };
        commit("Pickup location confirmed.");
      }
    } else if (a === "repair-collection") {
      const j = jobOf(id);
      if (!isStatusAdmin() || !j || j.collectionIssuedAt)
        return deniedWorkflow(
          "Only administrators can reopen an unrecorded collection.",
        );
      const stage = jobPickList(j)?.pickupConfirmedAt
        ? "Ready for Collection"
        : "Picking";
      if (adminSetJobStatus(id, stage)) commit(`Job reopened in ${stage}.`);
    } else if (a === "scan-barcode")
      performScan($("#barcode-input")?.value || "");
    else if (a === "quick-scan") performScan(el.dataset.value);
    else if (a === "toggle-camera") {
      if (mediaStream) {
        stopCamera();
        render();
      } else startCamera();
    } else if (a === "return-received") {
      if (markReturnReceived(id))
        commit("Return delivered for warehouse inspection.");
    } else if (a === "process-return") {
      const v = {};
      $$("[data-return-usable]").forEach(
        (x) => (v[x.dataset.returnUsable] = x.value),
      );
      if (processReturn(id, v, $("#return-credit")?.value !== "warranty"))
        commit("Return processed and inventory reconciled.");
    } else if (a === "cancel-return") {
      if (cancelReturn(id)) commit("Return cancelled; no inventory changed.");
    } else if (a === "open-approved-return") {
      openReturnWork(id);
    } else if (a === "self-collect-return") {
      await selfCollectReturn(
        id,
        $("#return-condition")?.value,
        $("#return-reason-note")?.value,
        $("#return-onsite")?.checked,
      );
    } else if (a === "request-product") {
      if (
        requestProduct(
          id,
          $("#addition-product")?.value,
          $("#addition-quantity")?.value,
          $("#addition-reason")?.value,
          el.dataset.returnId,
          $("#addition-direction")?.value,
        )
      )
        commit("Product request sent for approval.");
    } else if (a === "cancel-product-request") {
      if (cancelProductRequest(id, $("#addition-cancel-reason")?.value))
        commit("Request cancelled and stock reservation released.");
    } else if (a === "approve-product" || a === "reject-product") {
      if (
        decideProductRequest(
          id,
          a === "approve-product",
          $("#addition-installer")?.value,
          $("#addition-price")?.value,
          $("#addition-decision-note")?.value,
        )
      )
        commit("Product request decision recorded.");
    } else if (a === "confirm-addition-location") {
      if (confirmRequestLocation(id, $("#addition-location")?.value))
        commit("Pickup location confirmed. Scan the approved product.");
    } else if (a === "scan-addition") {
      performAdditionScan($("#barcode-input")?.value);
    } else if (a === "close-addition") {
      ui.productRequestId = "";
      stopCamera();
      render();
    } else if (a === "reopen-job") {
      if (reopenJob(id, $("#reopen-target")?.value, $("#reopen-reason")?.value))
        commit("Job reopened. Previous invoices and stock movements retained.");
    } else if (a === "save-billing-basis") {
      const prices = {};
      $$("[data-original-price]").forEach(
        (x) => (prices[x.dataset.originalPrice] = x.value),
      );
      if (
        saveBillingBasis(
          id,
          $("#billing-base-total")?.value,
          prices,
          $("#billing-basis-reason")?.value,
        )
      )
        commit("Billing basis confirmed.");
    } else if (a === "finalize-job-billing") {
      const j = jobOf(id);
      if (
        !canManageJobDetails() ||
        !hasCapability("billing_manage") ||
        j?.status !== "Completed"
      )
        return deniedWorkflow("Management can reconcile a completed job.");
      if (finalizeJobBilling(j)) commit("Final invoice / credit reconciled.");
      else deniedWorkflow(j.finalBillingStatus);
    } else if (a === "view-settlement") {
      if (!isInstaller() && hasCapability("billing_manage")) {
        ui.modal = { type: "settlement", id };
        render();
      }
    } else if (a === "start-return") {
      if (startReturn($("#return-job")?.value)) render();
    } else if (a === "scan-return") {
      performReturnScan($("#barcode-input")?.value);
    } else if (a === "remove-return-item") {
      const r = returnOf(id);
      if (!canEditReturn(r))
        return deniedWorkflow("This return cannot be edited.");
      r.items = r.items.filter((x) => x.jobItemId !== el.dataset.item);
      r.itemCount = r.items.length;
      commit("Product removed from draft return.");
    } else if (a === "submit-return") {
      if (
        submitReturn(
          id,
          $("#return-condition")?.value,
          $("#return-reason-note")?.value,
        )
      )
        commit("Return submitted. Management delivery task created.");
    } else if (a === "arrange-return") {
      if (
        arrangeReturn(
          id,
          $("#return-method")?.value,
          $("#return-installer")?.value,
          $("#return-warehouse")?.value,
        )
      )
        commit("Return delivery plan saved.");
    } else if (a === "collect-return") {
      if (collectReturn(id))
        commit(
          "Return collected. Deliver to the warehouse and upload the return form.",
        );
    } else if (a === "deliver-return") {
      if (deliverReturn(id))
        commit("Warehouse handover recorded. Your pickup task is complete.");
    } else if (a === "client-return-received") {
      if (receiveClientReturn(id))
        commit(
          "Client delivery received. Inspect products before adding stock.",
        );
    } else if (a === "reconcile-return") {
      const v = {};
      $$("[data-legacy-qty]").forEach(
        (x) => (v[x.dataset.legacyQty] = x.value),
      );
      if (reconcileLegacyReturn(id, v, $("#legacy-return-note")?.value))
        commit("Historical quantities reconciled; inventory unchanged.");
    } else if (a === "purchasing-tab") {
      ui.purchasingTab = el.dataset.tab;
      render();
    } else if (a === "receive-po") {
      receivePO(id);
      commit("Remaining goods received into inventory.");
    } else if (a === "billing-tab") {
      ui.billingTab = el.dataset.tab;
      render();
    } else if (a === "new-invoice") {
      ui.modal = { type: "invoice" };
      render();
    } else if (a === "create-invoice") {
      const v = formData("#invoice-form");
      if (createInvoice(v)) {
        ui.modal = null;
        commit("Invoice recorded / reconciled.");
      }
    } else if (a === "record-payment") {
      ui.modal = { type: "payment", id };
      render();
    } else if (a === "save-payment") {
      const v = formData("#payment-form");
      recordPayment(id, v.amount, v.method);
      ui.modal = null;
      commit("Payment recorded and allocated.");
    } else if (a === "send-reminder") {
      sendReminder(id);
      commit("Payment reminder simulated.");
    } else if (a === "new-user") {
      ui.modal = { type: "newUser" };
      render();
    } else if (a === "create-user") {
      const v = formData("#user-form");
      if (!v.name || !v.email) {
        toast("Full name and email are required.", "error");
        return;
      }
      if (
        state.users.some(
          (u) => u.email.toLowerCase() === String(v.email).trim().toLowerCase(),
        )
      ) {
        toast("That email is already used by another account.", "error");
        return;
      }
      if (!addUser(v)) {
        toast("That account or role is not allowed.", "error");
        return;
      }
      ui.modal = null;
      commit("Staff invitation created.");
    } else if (a === "edit-user" && isMasterSession()) {
      ui.modal = { type: "editUser", id };
      render();
    } else if (a === "save-user-edit" && isMasterSession()) {
      const v = formData("#edit-user-form");
      if (!v.name || !v.email) {
        toast("Full name and email are required.", "error");
        return;
      }
      const result = editUser(id, v);
      if (!result.ok) {
        toast(result.message, "error");
        return;
      }
      ui.modal = null;
      commit(result.message);
    } else if (a === "change-password" && isMasterSession()) {
      ui.modal = { type: "changePassword", id };
      render();
    } else if (a === "save-user-password" && isMasterSession()) {
      const v = formData("#change-password-form");
      if (String(v.password || "").length < 6) {
        toast("Password must contain at least 6 characters.", "error");
        return;
      }
      if (v.password !== v.confirmPassword) {
        toast("The passwords do not match.", "error");
        return;
      }
      if (!changeUserPassword(id, v.password)) {
        toast("Password could not be changed.", "error");
        return;
      }
      ui.modal = null;
      commit("User password changed.");
    } else if (a === "delete-user" && isMasterSession()) {
      ui.modal = { type: "deleteUser", id };
      render();
    } else if (a === "confirm-delete-user" && isMasterSession()) {
      if (!deleteUserAccount(id)) {
        toast("User could not be deleted.", "error");
        return;
      }
      ui.modal = null;
      commit("User deleted and linked work unassigned.");
    } else if (a === "impersonate-user" && isMasterSession()) {
      if (!beginImpersonation(id))
        toast("Only active users can be impersonated.", "error");
    } else if (a === "end-impersonation") endImpersonation();
    else if (a === "toggle-user") {
      toggleUser(id);
      commit("Account status updated.");
    } else if (a === "reset-password") resetPassword(id);
    else if (a === "switch-role" && isMasterSession()) {
      const u = state.users.find(
        (x) => x.role === el.dataset.role && x.status === "Active",
      );
      if (u) beginImpersonation(u.id);
    } else if (a === "logout") {
      if (state.session)
        log(
          "User signed out",
          "User",
          currentUser()?.email || "unknown",
          `${currentUser()?.name || "User"} signed out.`,
        );
      state.session = null;
      clearOwnerSession();
      stopCamera();
      save();
      ui.page = "dashboard";
      ui.loginEmail = "admin@demo.com";
      ui.loginPassword = "demo123";
      if (authBackend?.enabled) {
        await authBackend.signOut();
        location.assign("/login?reason=signed_out");
      } else render();
    } else if (a === "reset-demo") {
      if (resetOwnerDemo())
        toast("Demo data restored; owner password and audit history retained.");
    } else if (a === "close-modal") closeModal();
    else if (a === "close-child") {
      ui.child = null;
      render();
    }
  });

  function handleField(e) {
    const el = e.target;
    if (el.hasAttribute("data-report-type")) {
      const client = el.form.querySelector("[data-report-client]");
      client.disabled = !CLIENT_REPORT_TYPES.includes(el.value);
      if (client.disabled) client.value = "";
      return;
    }
    if (el.hasAttribute("data-po-product")) {
      const p = state.products.find((x) => x.id === el.value),
        row = el.closest(".po-line");
      row.querySelector("[name=brand]").value = p?.brand || p?.brandName || "";
      row.querySelector("[name=skuSupplierId]").value = p?.supplierId || "";
      updatePOSupplierInfo(row);
      return;
    }
    if (el.name === "skuSupplierId" && el.closest(".po-line")) {
      updatePOSupplierInfo(el.closest(".po-line"));
      return;
    }
    if (el.hasAttribute("data-task-job")) {
      const select = el.form?.elements.jobStage,
        j = jobOf(el.value);
      if (select) {
        select.disabled = !j;
        select.required = !!j;
        select.value = j?.status || "";
      }
      return;
    }
    if (el.dataset.ui) {
      ui[el.dataset.ui] = el.value;
      return;
    }
    if (el.dataset.chatMessage !== undefined) {
      ui.chatMessage = el.value;
      return;
    }
    if (el.dataset.filter) {
      if (["returnId", "productRequestId"].includes(el.dataset.filter))
        stopCamera();
      ui[el.dataset.filter] = el.value;
      render();
      return;
    }
    if (el.dataset.draftField && ui.quoteDraft) {
      if (canRunAction("save-quote"))
        ui.quoteDraft[el.dataset.draftField] = el.value;
      return;
    }
    if (el.dataset.lineField && ui.quoteDraft) {
      if (!canRunAction("save-quote")) return;
      const x = ui.quoteDraft.lines.find((y) => y.localId === el.dataset.id);
      if (x) {
        x[el.dataset.lineField] = Math.max(0, Number(el.value) || 0);
        render();
      }
      return;
    }
    if (el.dataset.usedItem && hasCapability("job_manage")) {
      ui.jobUsed = ui.jobUsed || {};
      ui.jobUsed[el.dataset.usedItem] = Math.max(0, Number(el.value) || 0);
    }
  }
  lifecycle.listen(root, "input", handleField);
  lifecycle.listen(root, "change", async (e) => {
    if (
      !accountSnapshot &&
      hostedOwnerMode() &&
      (state.session?.role === "super_admin" ||
        state.session?.impersonatorId) &&
      e.target.type === "file" &&
      !(await ensureHostedOwner(true))
    ) {
      state.session = null;
      render();
      return;
    }
    handleField(e);
    const el = e.target;
    if (el.dataset.chatFiles !== undefined && el.files?.length) {
      if (!hasCapability("chat_send")) {
        toast("Chat sending is disabled for your account.", "error");
        return;
      }
      await handleChatFiles(el.files);
      return;
    }
    if (el.dataset.returnForm && el.files?.length) {
      await uploadReturnForm(el.dataset.returnForm, el.files[0]);
      el.value = "";
      return;
    }
    if (el.dataset.installProof && el.files?.length) {
      await uploadInstallationProof(
        el.dataset.installProof,
        el.files,
        el.dataset.proofPhase || "after",
      );
      el.value = "";
      return;
    }
    if (el.dataset.photoJob && el.files?.[0]) {
      if (!hasCapability("job_manage")) {
        toast("Job updates are disabled for your account.", "error");
        return;
      }
      try {
        const j = jobOf(el.dataset.photoJob);
        if (!canViewJob(j))
          return deniedWorkflow("This job is not assigned to you.");
        const uri = await compressPhoto(el.files[0]);
        if (j) {
          const photo = {
            id: uid("photo"),
            uri,
            type: el.dataset.photoType,
            createdAt: now(),
            userId: state.session.userId,
          };
          j.photos = [photo, ...(j.photos || [])];
          j.timeline.unshift({
            id: uid("event"),
            title: `${photo.type} installation photo added`,
            detail: `${photo.type} photo attached to ${j.number}.`,
            at: photo.createdAt,
            userId: photo.userId,
          });
          log(
            "Job photo added",
            "Job",
            j.number,
            `${photo.type} installation photo attached.`,
          );
          commit(`${photo.type} photo attached successfully.`);
        }
      } catch (err) {
        toast("The selected photo could not be attached.", "error");
      }
    }
  });
  lifecycle.listen(root, "keydown", (e) => {
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key.toLowerCase() === "k" &&
      state.session
    ) {
      e.preventDefault();
      ui.drawer = "search";
      ui.globalSearch = "";
      render();
    }
    if (e.key === "Escape") {
      if (inventoryControls)
        void inventoryControls.handle({ dataset: { action: "inv-cancel" } });
      if (accountControls)
        void accountControls.handle({ dataset: { action: "account-cancel" } });
      if (ui.child) {
        ui.child = null;
        render();
      } else if (ui.modal) closeModal();
      else if (ui.drawer) {
        ui.drawer = null;
        render();
      } else if (ui.mobileMenu) {
        ui.mobileMenu = false;
        render();
      } else if (ui.chatThreadUserId || ui.chatDockOpen) {
        ui.chatThreadUserId = null;
        ui.chatDockOpen = false;
        render();
      }
    }
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      e.target.matches("[data-chat-message]")
    ) {
      e.preventDefault();
      const send = e.target
        .closest(".chat-composer")
        ?.querySelector('[data-action="send-chat"]');
      if (send && !send.disabled) sendChatMessage(send.dataset.id);
    }
    if (e.key === "Enter" && e.target.id === "barcode-input") {
      e.preventDefault();
      if (!hasCapability("picking_scan")) {
        toast("Scanning is disabled for your account.", "error");
        return;
      }
      performScan(e.target.value);
    }
  });
  lifecycle.listen(window, "hashchange", () => {
    guardSession();
    const p = location.hash.slice(1);
    if (p && allowedPage(p)) route(p);
    else render();
  });
  lifecycle.listen(window, "storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      const fresh = JSON.parse(e.newValue);
      if (fresh?.accessControl && fresh?.users) {
        state.accessControl = fresh.accessControl;
        state.users = fresh.users;
        guardSession();
        if (ui.modal && !isMasterSession()) ui.modal = null;
        if (ui.child && !isMasterSession()) ui.child = null;
        render();
      }
      if (fresh?.masterAuth?.version !== state.masterAuth?.version) {
        state.masterAuth = fresh?.masterAuth;
        guardSession();
        render();
      }
    } catch (err) {}
  });
  function applyAccountAccess(snapshot) {
    const previous = accountSnapshot?.context;
    const identityChanged =
      previous && previous.profile.id !== snapshot.context.profile.id;
    const grantsChanged =
      previous &&
      JSON.stringify(previous.modules) !==
        JSON.stringify(snapshot.context.modules);
    if ((identityChanged || grantsChanged) && cloud) {
      clearTimeout(cloudTimer);
      cloudDirty = false;
      ui.modal = null;
      ui.drawer = null;
      if (identityChanged) {
        location.reload();
        return;
      }
      EMPTY_COLLECTIONS.forEach((k) => {
        state[k] = [];
      });
      void cloud.store
        .load()
        .then((fresh) => {
          if (lifecycle.disposed || accessFailure) return;
          Object.assign(state, fresh);
          cloud.store.baseline?.(state);
          render();
        })
        .catch((failure) => {
          accessFailure = failure.message;
          state.session = null;
          render();
        });
    }
    accountSnapshot = snapshot;
    accessFailure = null;
    const profile = snapshot.context.profile;
    const viewer = {
      id: profile.id,
      name: profile.full_name || profile.email || "CRM user",
      email: profile.email || "",
      role: profile.role,
    };
    for (const account of snapshot.accounts) {
      let user = state.users.find((candidate) => candidate.id === account.id);
      if (!user) {
        user = { id: account.id };
        state.users.push(user);
      }
      Object.assign(user, {
        authId: account.id,
        name: account.full_name || account.email || "CRM user",
        email: account.email || "",
        phone: account.phone || "",
        role: account.role,
        status: account.status === "active" ? "Active" : account.status,
        lastLogin: account.last_seen_at || "Never",
        avatar: initials(account.full_name || account.email || "CRM"),
      });
    }
    connectViewer(viewer);
    state.session = {
      userId: profile.id,
      role: profile.role,
      ...(snapshot.context.impersonation
        ? { impersonatorId: snapshot.context.impersonation.real_actor_user_id }
        : {}),
    };
  }
  if (authBackend?.accounts && accountSnapshot) {
    applyAccountAccess(accountSnapshot);
    accountControls = createAccountControls({
      backend: authBackend.accounts,
      initial: accountSnapshot,
      ctx,
      lifecycle,
      render,
      onAccess: applyAccountAccess,
      onFailure(error) {
        accessFailure = error.message;
        state.session = null;
        stopCamera();
        render();
        if (document.cookie.includes("crm-impersonation=")) {
          location.replace("/crm/dashboard");
          $("#app").innerHTML =
            `<main class="crm-loading"><section><h1>Impersonation needs attention</h1><p>${esc(error.message)}</p><form method="post" action="/api/impersonation/exit"><button class="btn">Exit impersonation</button></form></section></main>`;
        }
      },
    });
  }
  workflowControls = createJobWorkflowControls({
    ctx,
    backend: cloud
      ? authBackend?.jobWorkflow || {
          command: async () => {
            throw Error(
              "The job workflow backend must be deployed before these changes can be saved.",
            );
          },
        }
      : null,
    render,
    prepare: async () => {
      if (cloud && !(await flushCloud()))
        throw Error(cloudError || "Save pending changes first.");
      if (accountControls) await accountControls.refresh();
    },
    apply: (result) => {
      const j = jobOf(result.job.id);
      if (j) Object.assign(j, result.job);
      else state.jobs.unshift(result.job);
      const quote = quoteOf(result.job.quoteId);
      if (quote) quote.linkedJobId = result.job.id;
      const lead = leadOf(result.job.leadId);
      if (lead && quote) lead.stage = "Won";
      state.tasks = state.tasks
        .filter((t) => t.jobId !== result.job.id)
        .concat(result.tasks);
      ensureInstallationProofTask(state, j || result.job);
      if (cloud) {
        cloud.store.baseline?.(state);
      } else save();
      ui.modal = { type: "job", id: result.job.id };
      ui.jobTab = "overview";
      void jobApprovals?.refresh();
    },
  });
  if (authBackend?.master && accountSnapshot)
    masterControls = createMasterControls({
      backend: authBackend.master,
      ctx,
      lifecycle,
      access: () => accountSnapshot?.context,
      accounts: () => accountSnapshot?.accounts || [],
      render,
      revalidate: async () => {
        await accountControls?.refresh();
      },
    });
  function inventoryCollectionConfirmed(fresh) {
    const job = state.jobs.find((j) => j.id === fresh.id);
    if (!job) return;
    Object.assign(job, fresh);
    const pick = jobPickList(job);
    if (pick) {
      pick.status = "Completed";
      pick.completedAt = fresh.collectionIssuedAt;
    }
    autoCompleteEvidenceTasks(job, collectionTask);
    save();
  }
  function applyInventory(snapshot) {
    const data = {
      ...EMPTY_INVENTORY,
      ...snapshot,
      movements: snapshot.recent_movements || snapshot.movements || [],
    };
    state.products = inventoryRows(data).map((row) => ({
      id: row.variant.id,
      catalogueId: row.product.id,
      name:
        row.product.name +
        (Object.keys(row.variant.attributes || {}).length
          ? " · " + row.variant.name
          : ""),
      sku: row.variant.sku,
      barcode:
        data.barcodes.find(
          (b) => b.variant_id === row.variant.id && b.is_primary,
        )?.barcode || "",
      onHand: row.onHand,
      reserved: row.reserved,
      minStock: row.threshold,
      damaged: row.balances.reduce(
        (n, b) => n + Number(b.quantity_damaged || 0),
        0,
      ),
      costPrice: row.variant.cost_price ?? row.product.cost_price,
      sellPrice: row.variant.sale_price ?? row.product.sale_price,
      category:
        data.categories.find((c) => c.id === row.product.category_id)?.name ||
        "",
      brand: row.variant.brand || row.product.metadata?.brand || "",
      warehouse: row.balances.length ? "Multiple / see inventory" : "No stock",
      location: "See per-location breakdown",
      active: row.variant.active && row.product.active,
    }));
    state.stockMovements = data.movements.map((m) => ({
      ...m,
      productId: m.variant_id,
      productName: m.variant_snapshot?.name || "Product",
      type: m.movement_type,
      quantity: ["reserve", "release", "transfer"].includes(m.movement_type)
        ? 0
        : m.movement_type === "inspected_return"
          ? Number(m.quantity) - Number(m.damaged_quantity_delta || 0)
          : m.from_location_id && !m.to_location_id
            ? -Number(m.quantity)
            : Number(m.quantity),
      reason: m.notes,
      userId: m.created_by,
      createdAt: m.created_at,
    }));
  }
  if (authBackend?.inventory && cloud) {
    if (options.inventory?.data) applyInventory(options.inventory.data);
    else {
      state.products = [];
      state.stockMovements = [];
    }
    inventoryControls = createInventoryControls({
      backend: authBackend.inventory,
      ctx,
      lifecycle,
      access: () => accountSnapshot?.context,
      render,
      initial: options.inventory,
      onData: applyInventory,
    });
  }
  const approvalMediaRevisions = new Map();
  if (authBackend?.jobApprovals && cloud) {
    jobApprovals = createJobApprovalControls({
      backend: authBackend.jobApprovals,
      ctx,
      lifecycle,
      render,
      access: () => accountSnapshot?.context,
      async beforeReview() {
        await accountControls?.refresh();
        if (accessFailure) throw new Error(accessFailure);
        clearTimeout(cloudTimer);
        return flushCloud();
      },
      onData(data) {
        if (cloudDirty || cloudFlushing || accessFailure) return;
        const before = JSON.stringify([state.jobs, state.tasks, state.returns]);
        for (const row of data.jobs) {
          if (approvalMediaRevisions.get(row.job_id) !== row.revision) {
            for (const proof of row.job.installationProof || []) {
              proofAvailability.delete(proof.blobId);
              const url = proofURLs.get(proof.blobId);
              if (url) lifecycle.revokeObjectURL(url);
              proofURLs.delete(proof.blobId);
            }
            approvalMediaRevisions.set(row.job_id, row.revision);
          }
          const index = state.jobs.findIndex((j) => j.id === row.job_id);
          if (index >= 0) state.jobs[index] = row.job;
          else state.jobs.push(row.job);
        }
        // Keep unrelated general tasks; the review snapshot refreshes linked work.
        if (data.tasks) {
          const ids = new Set(data.jobs.map((j) => j.job_id));
          state.tasks = [
            ...state.tasks.filter((t) => !ids.has(t.jobId)),
            ...data.tasks,
          ];
        }
        if (data.returns) {
          const ids = new Set(data.jobs.map((j) => j.job_id));
          state.returns = [
            ...state.returns.filter((r) => !ids.has(r.jobId)),
            ...data.returns,
          ];
        }
        if (ui.reportResult?.type === "jobs")
          ui.reportResult = createBusinessReport(ui.reportResult.filters);
        return (
          before !== JSON.stringify([state.jobs, state.tasks, state.returns])
        );
      },
    });
  }
  lifecycle.listen(window, "beforeunload", stopCamera);
  save();
  if (!hostedOwnerMode()) guardSession();
  const requested = location.hash.slice(1) || initialPage;
  if (requested && state.session && allowedPage(requested)) ui.page = requested;
  if (
    !accountSnapshot &&
    hostedOwnerMode() &&
    initialViewer?.role === "super_admin" &&
    !hostedOwnerActive()
  )
    void bootstrapHostedOwner();
  if (cloud)
    setInterval(async () => {
      if (
        cloudDirty ||
        cloudFlushing ||
        ui.modal ||
        ui.drawer ||
        !state.session
      )
        return;
      try {
        const fresh = await cloud.store.load();
        const staff = await cloud.store.staff();
        if (cloudDirty || cloudFlushing || accessFailure) return;
        const session = state.session;
        EMPTY_COLLECTIONS.forEach((k) => (state[k] = []));
        Object.assign(state, fresh);
        state.users = staffToUsers(staff);
        normalizeOwner(state);
        if (accountSnapshot) applyAccountAccess(accountSnapshot);
        else connectViewer(initialViewer);
        if (!accountSnapshot) state.session = session;
        if (inventoryControls?.data) applyInventory(inventoryControls.data);
        cloud.store.baseline?.(state);
        render();
      } catch (e) {}
    }, 30000);
  setInterval(async () => {
    if (
      accountSnapshot ||
      !hostedOwnerMode() ||
      !state.session ||
      (state.session.role !== "super_admin" && !state.session.impersonatorId)
    )
      return;
    if (!(await ensureHostedOwner(true))) {
      state.session = null;
      stopCamera();
      save();
      render();
    }
  }, 60000);
  lifecycle.listen(window, "popstate", () => {
    const page = moduleFromPath(location.pathname);
    guardSession();
    if (state.session && allowedPage(page)) ui.page = page;
    render();
  });
  render();
  return () => {
    workflowControls?.dispose();
    lifecycle.dispose();
    accountControls?.dispose();
    inventoryControls?.dispose();
    jobApprovals?.dispose();
    stopCamera();
    proofURLs.clear();
    proofAvailability.clear();
    root.replaceChildren();
  };
}
